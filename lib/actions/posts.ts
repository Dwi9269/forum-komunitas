"use server";

/**
 * Server actions post & feed — PRD bagian 4.3 (Post), 16.3 (trigger),
 * 16.7 (View feed), 18.2–18.3 (kriteria selesai), 20 (Kasus Tepi),
 * 21 (Validasi Input), 24 (Kontrak Akses Data).
 *
 * Aturan keras yang dijaga file ini:
 * - Post HANYA dibaca lewat view `posts_feed` atau RPC `get_feed` — tabel
 *   `posts` mentah tidak pernah dibaca klien (tulis saja yang boleh, dan
 *   hanya kolom yang diberi grant: community_id/author_id/title/body/
 *   is_anonymous untuk insert, title/body/is_deleted untuk update).
 * - Post anonim tidak membocorkan penulis: view sudah menyamarkan
 *   author_id/author_username/author_avatar menjadi null bila
 *   `is_anonymous`, sementara `is_mine` tetap benar bagi penulisnya agar
 *   tombol edit/hapus miliknya sendiri tetap tampil.
 * - Klien tidak pernah menulis kolom score/is_hidden/edited_at (score dihit
 *   trigger vote; edited_at diisi trigger posts_touch_edit).
 * - Foto (Fase 4): MEDIA-AGENT mengunggah file ke bucket `post-images` pada
 *   path `{user_id}/{uuid}.{ext}` langsung dari browser (kompres + buang
 *   EXIF di klien, PRD 25); file ini hanya menerima DAFTAR PATH di
 *   createPost lalu menyimpan relasi `post_images`, dan membaca foto untuk
 *   feed/detail sebagai URL publik. Upload tidak pernah dilakukan di server.
 *
 * Pagination kursor: cursor = offset yang di-encode (base64url JSON),
 * opaque bagi klien. Filter (communitySlug/username/search/sort/onlyJoined)
 * HARUS dikirim ulang sama persis pada halaman berikutnya — cursor hanya
 * menyimpan offset, bukan filter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appError,
  extractErrorCode,
  type ActionResult,
  type AppError,
  type ErrorCode,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "./auth";
import { validatePostBody, validatePostTitle } from "./validate";

// ============================================================
// Tipe (kontrak untuk FRONTEND-AGENT)
// ============================================================

export type FeedSort = "new" | "hot";

/** Baris view posts_feed (PRD 16.7) — nama kolom persis seperti di DB. */
export interface FeedPost {
  id: string;
  community_id: string;
  title: string;
  /** Bisa null — skema membolehkan post tanpa isi. */
  body: string | null;
  score: number;
  comment_count: number;
  is_anonymous: boolean;
  created_at: string;
  /** Terisi bila pernah diedit → tampil label "(diedit)" (PRD 4.3). */
  edited_at: string | null;
  /** null untuk post anonim — JANGAN dipakai menampilkan penulis. */
  author_id: string | null;
  author_username: string | null;
  author_avatar: string | null;
  /** true bagi penulis — termasuk post anonim miliknya sendiri. */
  is_mine: boolean;
  /** Vote pengguna sesi atas post ini; null = belum memilih. */
  my_vote: -1 | 0 | 1 | null;
  /**
   * URL publik foto post (bucket post-images), urut position — Fase 4.
   * Kosong bila post tanpa foto atau gagal memuat (bukan error feed).
   */
  images: string[];
}

/** Komentar dari view comments_view (PRD 16.7) untuk satu post. */
export interface CommentItem {
  id: string;
  post_id: string;
  parent_id: string | null;
  /** 0–3 (PRD 4.4: kedalaman maksimum 3). */
  depth: number;
  score: number;
  created_at: string;
  /** true bila dihapus/disembunyikan → tampil "[komentar dihapus]" (PRD 18.4.3). */
  is_removed: boolean;
  body: string | null;
  author_id: string | null;
  author_username: string | null;
  author_avatar: string | null;
  is_mine: boolean;
  my_vote: -1 | 0 | 1 | null;
}

export interface GetFeedParams {
  /** Cursor opaque dari data.nextCursor halaman sebelumnya. */
  cursor?: string;
  /** Filter satu komunitas (halaman /c/[slug]). */
  communitySlug?: string;
  /** Filter profil penulis (halaman profil); post anonim otomatis tersaring. */
  username?: string;
  /** Cari frasa di judul/isi (case-insensitive). */
  search?: string;
  /** "new" (default, terbaru) atau "hot" (populer, PRD 4.3/16.7). */
  sort?: FeedSort;
  /** Hanya komunitas yang diikuti (PRD 24 "hanya yang diikuti?"; PRD 18.2.1). */
  onlyJoined?: boolean;
  /** Ukuran halaman; default 20 (PRD 24 "maks 20"), maksimum 50 (batas RPC). */
  limit?: number;
}

export interface FeedData {
  posts: FeedPost[];
  /** Cursor halaman berikutnya; null berarti halaman terakhir. */
  nextCursor: string | null;
}

export interface PostDetailData {
  post: FeedPost;
  /**
   * Flat (bukan pohon), sudah terurut skor desc lalu waktu terlama —
   * susun pohon dengan buildCommentTree() dari ./comment-tree bila perlu.
   */
  comments: CommentItem[];
}

export interface CreatePostInput {
  /** Salah satu dari communityId / communitySlug wajib ada. */
  communityId?: string;
  communitySlug?: string;
  title: string;
  /** Isi teks; boleh kosong (tersimpan null sesuai skema). */
  body?: string;
  isAnonymous?: boolean;
  /**
   * Path storage foto hasil unggahan MEDIA-AGENT (Fase 4), persis
   * `{user.id}/{uuid}.{ext}` di bucket post-images — maksimal 4 (PRD 25).
   * Bukan URL, bukan base64: file SUDAH diunggah klien sebelum createPost.
   */
  images?: string[];
}

export interface EditPostInput {
  id: string;
  title: string;
  body: string;
}

// ============================================================
// Konstanta & helper internal
// ============================================================

const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 50;

/** Batas foto per post (PRD 25: files.length > 4 → IMAGE_LIMIT). */
const MAX_POST_IMAGES = 4;

/** Baris mentah tabel post_images yang dibutuhkan. */
interface PostImageRow {
  post_id: string;
  storage_path: string;
  position: number;
}

/** Baris mentah view posts_feed sebelum my_vote dipertipakan. */
interface PostFeedRow {
  id: string;
  community_id: string;
  title: string;
  body: string | null;
  score: number;
  comment_count: number;
  is_anonymous: boolean;
  created_at: string;
  edited_at: string | null;
  author_id: string | null;
  author_username: string | null;
  author_avatar: string | null;
  is_mine: boolean;
  my_vote: number | null;
}

/** Baris mentah view comments_view sebelum my_vote dipertipakan. */
interface CommentRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  depth: number;
  score: number;
  created_at: string;
  is_removed: boolean;
  body: string | null;
  author_id: string | null;
  author_username: string | null;
  author_avatar: string | null;
  is_mine: boolean;
  my_vote: number | null;
}

function narrowVote(value: number | null): -1 | 0 | 1 | null {
  return value === 1 || value === -1 || value === 0 ? value : null;
}

function toFeedPost(row: PostFeedRow): FeedPost {
  // images diisi [] dulu, lalu ditimpa URL asli oleh withImages().
  return { ...row, my_vote: narrowVote(row.my_vote), images: [] };
}

/**
 * Muat URL publik foto untuk banyak post sekaligus (satu query per halaman
 * feed). Gagal memuat HANYA dicatat — feed tetap tampil tanpa foto
 * (RLS pimg_select menyaring foto post yang tidak terlihat).
 */
async function fetchImageUrls(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) {
    return map;
  }
  try {
    const { data, error } = await supabase
      .from("post_images")
      .select("post_id, storage_path, position")
      .in("post_id", ids)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      console.error("posts: gagal memuat foto post —", error.message);
      return map;
    }
    const bucket = supabase.storage.from("post-images");
    for (const row of (data ?? []) as PostImageRow[]) {
      const list = map.get(row.post_id) ?? [];
      list.push(bucket.getPublicUrl(row.storage_path).data.publicUrl);
      map.set(row.post_id, list);
    }
  } catch (e) {
    console.error("posts: gagal memuat foto post —", e);
  }
  return map;
}

/** Tempelkan images ke tiap post lalu susun hasil FeedData standar. */
async function withImages(
  supabase: SupabaseClient,
  posts: FeedPost[],
  limit: number,
  offset: number,
): Promise<ActionResult<FeedData>> {
  const imageMap = await fetchImageUrls(
    supabase,
    posts.map((p) => p.id),
  );
  for (const post of posts) {
    post.images = imageMap.get(post.id) ?? [];
  }
  return {
    ok: true,
    data: { posts, nextCursor: nextCursor(posts.length, limit, offset) },
  };
}

function toCommentItem(row: CommentRow): CommentItem {
  return { ...row, my_vote: narrowVote(row.my_vote) };
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

function clampLimit(limit?: number): number {
  const n = Math.trunc(Number(limit ?? DEFAULT_FEED_LIMIT));
  if (!Number.isFinite(n)) {
    return DEFAULT_FEED_LIMIT;
  }
  return Math.min(Math.max(n, 1), MAX_FEED_LIMIT);
}

/** Cursor = offset ter-encode (base64url JSON) — opaque bagi klien. */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { o?: unknown };
    return typeof parsed.o === "number" && Number.isInteger(parsed.o) && parsed.o >= 0
      ? parsed.o
      : 0;
  } catch {
    return 0;
  }
}

function nextCursor(returned: number, limit: number, offset: number): string | null {
  return returned === limit ? encodeCursor(offset + limit) : null;
}

/**
 * Bersihkan frasa pencarian untuk sintaks `or=` PostgREST: koma memisahkan
 * kondisi, % _ ( ) punya makna khusus — semuanya diganti spasi.
 */
function cleanSearch(search?: string): string {
  return (search ?? "").replace(/[%_,()]/g, " ").trim();
}

/**
 * Update berdampak 0 baris: RLS menyaring baris diam-diam, jadi bedakan
 * sebabnya dengan satu bacaan view (PRD 20): post tidak ada/tersembunyi →
 * NOT_FOUND; milik sendiri tapi ditolak (mis. status akun berubah) →
 * RLS_DENIED; bukan milik → FORBIDDEN (moderator memakai RPC moderasi).
 */
async function resolvePostUpdateMiss(
  supabase: SupabaseClient,
  id: string,
): Promise<AppError> {
  try {
    const { data } = await supabase
      .from("posts_feed")
      .select("is_mine")
      .eq("id", id)
      .maybeSingle();
    if (!data) {
      return appError("NOT_FOUND");
    }
    return appError((data as { is_mine: boolean }).is_mine ? "RLS_DENIED" : "FORBIDDEN");
  } catch (e) {
    return extractErrorCode(e);
  }
}

// ============================================================
// Aksi: feed (PRD 24 getFeed; PRD 16.7 get_feed / posts_feed)
// ============================================================

export async function getFeed(
  params: GetFeedParams = {},
): Promise<ActionResult<FeedData>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }
    const supabase = await createClient();

    const sort: FeedSort = params.sort === "hot" ? "hot" : "new";
    const limit = clampLimit(params.limit);
    const offset = decodeCursor(params.cursor ?? "");

    // Slug komunitas → id. Tabel communities boleh dibaca authenticated
    // (RLS comm_select) — bukan tabel post/komentar.
    let communityId: string | null = null;
    const slug = params.communitySlug?.trim() ?? "";
    if (slug) {
      const { data, error } = await supabase
        .from("communities")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        return failure(extractErrorCode(error));
      }
      if (!data) {
        return failure(appError("NOT_FOUND"));
      }
      communityId = (data as { id: string }).id;
    }

    // RPC get_feed tidak mendukung filter username/search → jalur itu
    // memakai view posts_feed langsung.
    const hasCustomFilter = Boolean(params.username?.trim() || cleanSearch(params.search));

    if (!hasCustomFilter) {
      // PRD 24: rpc('get_feed', ...) — sort 'new' | 'hot' (PRD 16.7).
      const { data, error } = await supabase.rpc("get_feed", {
        p_community: communityId,
        p_sort: sort,
        p_limit: limit,
        p_offset: offset,
        p_only_joined: params.onlyJoined === true,
      });
      if (error) {
        return failure(extractErrorCode(error));
      }
      const posts = ((data as PostFeedRow[] | null) ?? []).map(toFeedPost);
      return withImages(supabase, posts, limit, offset);
    }

    // Jalur view posts_feed untuk filter username/search. Sort "hot" di
    // jalur ini memakai proksi (score desc, created_at desc) karena rumus
    // populer hanya ada di SQL get_feed — keterbatasan dicatat di handoff.
    let query = supabase.from("posts_feed").select("*");

    const username = params.username?.trim() ?? "";
    if (username) {
      // Post anonim otomatis terkecuali (author_username null di view) —
      // halaman profil tidak pernah membocorkan post anonim.
      query = query.eq("author_username", username);
    }

    const search = cleanSearch(params.search);
    if (search) {
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }

    if (communityId) {
      query = query.eq("community_id", communityId);
    }

    if (params.onlyJoined === true) {
      const { data: memberRows, error: memberError } = await supabase
        .from("community_members")
        .select("community_id")
        .eq("user_id", user.id);
      if (memberError) {
        return failure(extractErrorCode(memberError));
      }
      const joinedIds = ((memberRows ?? []) as { community_id: string }[]).map(
        (row) => row.community_id,
      );
      if (joinedIds.length === 0) {
        // Belum mengikuti apa pun → feed kosong, ajakan pilih komunitas
        // (PRD 18.2.1; bukan error).
        return { ok: true, data: { posts: [], nextCursor: null } };
      }
      query = query.in("community_id", joinedIds);
    }

    query =
      sort === "hot"
        ? query
            .order("score", { ascending: false })
            .order("created_at", { ascending: false })
        : query.order("created_at", { ascending: false });

    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) {
      return failure(extractErrorCode(error));
    }
    const posts = ((data as PostFeedRow[] | null) ?? []).map(toFeedPost);
    return withImages(supabase, posts, limit, offset);
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: detail post + komentar (PRD 24 getPost + getComments)
// ============================================================

export async function getPost(id: string): Promise<ActionResult<PostDetailData>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const postId = id?.trim() ?? "";
    if (!postId) {
      return failure(appError("NOT_FOUND"));
    }
    const supabase = await createClient();

    // PRD 24: from('posts_feed').select().eq('id', id).single().
    // Post hidden/deleted tidak ada di view → NOT_FOUND ("tidak ditemukan").
    const { data: postRow, error: postError } = await supabase
      .from("posts_feed")
      .select("*")
      .eq("id", postId)
      .maybeSingle();
    if (postError) {
      return failure(extractErrorCode(postError));
    }
    if (!postRow) {
      return failure(appError("NOT_FOUND"));
    }

    // PRD 24 getComments: from('comments_view').eq('post_id', id).
    // Urutan (PRD 18.4.5): skor desc, lalu waktu terlama; komentar
    // is_removed TETAP disertakan agar balasannya tetap terlihat.
    const { data: commentRows, error: commentError } = await supabase
      .from("comments_view")
      .select("*")
      .eq("post_id", postId)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true });
    if (commentError) {
      return failure(extractErrorCode(commentError));
    }

    const post = toFeedPost(postRow as PostFeedRow);
    // Foto detail post (Fase 4): URL publik urut position; kosong bila
    // gagal memuat / post tanpa foto.
    const imageMap = await fetchImageUrls(supabase, [postId]);
    post.images = imageMap.get(postId) ?? [];

    return {
      ok: true,
      data: {
        post,
        comments: ((commentRows ?? []) as CommentRow[]).map(toCommentItem),
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: buat post (PRD 24 createPost; foto[] via path MEDIA-AGENT, PRD 25)
// ============================================================

export async function createPost(
  input: CreatePostInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    // Validasi cepat PRD 21 (trim dulu — PRD 20 kasus tepi 8).
    const title = (input.title ?? "").trim();
    const titleError = validatePostTitle(title);
    if (titleError) {
      return failure(titleError);
    }
    const body = (input.body ?? "").trim();
    const bodyError = validatePostBody(body);
    if (bodyError) {
      return failure(bodyError);
    }

    // Validasi foto (PRD 25: maks 4; path wajib di folder user sendiri —
    // RLS pimg_insert + policy storage menuntut hal yang sama). Divalidasi
    // SEBELUM post dibuat agar tidak ada post yang kehilangan fotonya.
    const imagePaths: string[] = [];
    if (input.images !== undefined) {
      if (!Array.isArray(input.images) || input.images.length > MAX_POST_IMAGES) {
        return failure(appError("IMAGE_INVALID"));
      }
      const seen = new Set<string>();
      for (const raw of input.images) {
        const path = typeof raw === "string" ? raw.trim() : "";
        if (!path) {
          continue;
        }
        if (!path.startsWith(`${user.id}/`)) {
          // Bukan path milik sendiri → buang dan catat (RLS akan menolak juga).
          console.warn(
            `createPost: abaikan path foto ${JSON.stringify(path)} — bukan di folder ${user.id}/`,
          );
          continue;
        }
        if (seen.has(path)) {
          continue;
        }
        seen.add(path);
        imagePaths.push(path);
      }
    }

    const supabase = await createClient();

    // Resolusi + verifikasi komunitas (tabel communities boleh dibaca).
    let communityId = input.communityId?.trim() ?? "";
    const slug = input.communitySlug?.trim() ?? "";
    if (communityId) {
      const { data, error } = await supabase
        .from("communities")
        .select("id")
        .eq("id", communityId)
        .maybeSingle();
      if (error) {
        return failure(extractErrorCode(error));
      }
      if (!data) {
        return failure(appError("NOT_FOUND"));
      }
    } else if (slug) {
      const { data, error } = await supabase
        .from("communities")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        return failure(extractErrorCode(error));
      }
      if (!data) {
        return failure(appError("NOT_FOUND"));
      }
      communityId = (data as { id: string }).id;
    } else {
      return failure(appError("NOT_FOUND"));
    }

    // Rate limit (PRD 16.4) dan status akun dijaga trigger + RLS di DB —
    // error RATE_LIMIT / RLS_DENIED dipetakan extractErrorCode.
    const { data, error } = await supabase
      .from("posts")
      .insert({
        community_id: communityId,
        author_id: user.id,
        title,
        body: body === "" ? null : body,
        is_anonymous: input.isAnonymous === true,
      })
      .select("id")
      .single();
    if (error) {
      return failure(extractErrorCode(error));
    }

    // PRD 24: hasil createPost adalah id post (untuk redirect ke detail).
    const postId = (data as { id: string }).id;

    // Simpan relasi foto (PRD 25.4 langkah 3). Kegagalan SATU foto HANYA
    // dicatat — post tetap tayang tanpa foto itu (instruksi Fase 4; berbeda
    // dari PRD 25.4 yang menghapus post). File yatim di storage dibersihkan
    // job mingguan (PRD 20 kasus tepi 3). Catatan: RLS pimg_insert juga
    // menuntut can_upload() (akun ≥ 24 jam atau moderator/admin, PRD 18.3.10)
    // sehingga akun baru bisa saja gagal di sini. Kolom width/height tidak
    // dikirim kontrak (images: string[]) → tersimpan null.
    if (imagePaths.length > 0) {
      for (let i = 0; i < imagePaths.length; i++) {
        const { error: imgError } = await supabase.from("post_images").insert({
          post_id: postId,
          storage_path: imagePaths[i],
          position: i,
        });
        if (imgError) {
          console.error(
            `createPost: gagal menyimpan foto "${imagePaths[i]}" —`,
            imgError.message,
          );
        }
      }
    }

    return { ok: true, data: { id: postId } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: edit post (PRD 24 editPost; label "(diedit)" diisi trigger)
// ============================================================

export async function editPost(
  input: EditPostInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const title = (input.title ?? "").trim();
    const titleError = validatePostTitle(title);
    if (titleError) {
      return failure(titleError);
    }
    const body = (input.body ?? "").trim();
    const bodyError = validatePostBody(body);
    if (bodyError) {
      return failure(bodyError);
    }

    const id = input.id?.trim() ?? "";
    if (!id) {
      return failure(appError("NOT_FOUND"));
    }

    const supabase = await createClient();
    // Grant kolom DB hanya title/body/is_deleted; edited_at diisi trigger
    // posts_touch_edit (PRD 16.3). Hanya penulis (RLS posts_update_own);
    // moderator menyembunyikan lewat RPC mod_apply_action.
    const { count, error } = await supabase
      .from("posts")
      .update({ title, body: body === "" ? null : body }, { count: "exact" })
      .eq("id", id);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      return failure(await resolvePostUpdateMiss(supabase, id));
    }
    return { ok: true, data: { id } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: hapus post (PRD 24 deletePost; soft delete — PRD 18.3.8)
// ============================================================

export async function deletePost(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const postId = id?.trim() ?? "";
    if (!postId) {
      return failure(appError("NOT_FOUND"));
    }

    const supabase = await createClient();
    const { count, error } = await supabase
      .from("posts")
      .update({ is_deleted: true }, { count: "exact" })
      .eq("id", postId);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      return failure(await resolvePostUpdateMiss(supabase, postId));
    }
    return { ok: true, data: { id: postId } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
