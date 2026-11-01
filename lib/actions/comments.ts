"use server";

/**
 * Server actions komentar — PRD bagian 4.4 (Komentar), 16.3 (validasi
 * parent/depth/post + hitungan komentar di DB), 16.4 (rate limit di DB),
 * 18.4 (kriteria selesai), 20 (Kasus Tepi), 24 (Kontrak Akses Data).
 *
 * Aturan keras yang dijaga file ini:
 * - Komentar hanya dibaca lewat view `comments_view`; tabel `comments`
 *   mentah hanya dipakai untuk menulis (insert + update is_deleted, sesuai
 *   grant kolom DB).
 * - Komentar TIDAK bisa anonim: skema tidak punya is_anonymous dan PRD 4.4
 *   tidak mendefinisikannya.
 * - Klien tidak pernah menulis score/is_hidden/depth (depth dihitung trigger
 *   before_comment_insert; score oleh trigger vote).
 * - editComment TIDAK disediakan: PRD 24 hanya mendefinisikan createComment
 *   dan deleteComment (PRD 4.4 hanya mensyaratkan hapus milik sendiri).
 *
 * Pengecekan parent/depth/ketersediaan post/rate limit didelegasikan ke
 * trigger database (penjaga terakhir, PRD 24 "validasi dua kali") — error
 * PARENT_INVALID, PARENT_UNAVAILABLE, DEPTH_EXCEEDED, POST_UNAVAILABLE,
 * RATE_LIMIT dipetakan oleh extractErrorCode.
 */

import {
  appError,
  extractErrorCode,
  type ActionResult,
  type AppError,
  type ErrorCode,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "./auth";
import { validateCommentBody } from "./validate";

// ============================================================
// Tipe (kontrak untuk FRONTEND-AGENT)
// ============================================================

export interface CreateCommentInput {
  postId: string;
  /** Komentar induk untuk balasan; kosong/null = komentar tingkat 1. */
  parentId?: string;
  body: string;
}

/** Komentar baru — subset kolom comments_view (PRD 16.7). */
export interface NewComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  /** Kedalaman hasil hitung trigger (0–3). */
  depth: number;
  body: string;
  created_at: string;
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

// ============================================================
// Aksi: buat komentar (PRD 24 createComment; PRD 18.4.1, 20 kasus tepi 1)
// ============================================================

export async function createComment(
  input: CreateCommentInput,
): Promise<ActionResult<{ comment: NewComment }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    // Validasi cepat PRD 21 (trim dulu — PRD 20 kasus tepi 8).
    const body = (input.body ?? "").trim();
    const bodyError = validateCommentBody(body);
    if (bodyError) {
      return failure(bodyError);
    }

    const postId = input.postId?.trim() ?? "";
    if (!postId) {
      return failure(appError("NOT_FOUND"));
    }
    const parentId = input.parentId?.trim() || null;

    const supabase = await createClient();

    // Pra-cek keberadaan post lewat VIEW (bukan tabel mentah). Post yang
    // dihapus/disembunyikan tidak ada di view → POST_UNAVAILABLE sesuai
    // PRD 20 kasus tepi 1 (UI menyimpan isi form agar tidak hilang).
    const { data: post, error: postError } = await supabase
      .from("posts_feed")
      .select("id")
      .eq("id", postId)
      .maybeSingle();
    if (postError) {
      return failure(extractErrorCode(postError));
    }
    if (!post) {
      return failure(appError("POST_UNAVAILABLE"));
    }

    // Trigger before_comment_insert memvalidasi parent (PARENT_INVALID,
    // PARENT_UNAVAILABLE), kedalaman (DEPTH_EXCEEDED), post tersedia
    // (POST_UNAVAILABLE); enforce_rate_limit memicu RATE_LIMIT.
    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        parent_id: parentId,
        author_id: user.id,
        body,
      })
      .select("id, post_id, parent_id, depth, body, created_at")
      .single();
    if (error) {
      return failure(extractErrorCode(error));
    }

    return {
      ok: true,
      data: {
        comment: {
          id: data.id,
          post_id: data.post_id,
          parent_id: data.parent_id ?? null,
          depth: data.depth,
          body: data.body,
          created_at: data.created_at,
        },
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: hapus komentar (PRD 24 deleteComment; soft delete is_deleted)
// ============================================================

export async function deleteComment(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const commentId = id?.trim() ?? "";
    if (!commentId) {
      return failure(appError("NOT_FOUND"));
    }

    const supabase = await createClient();
    // Hanya penulis (RLS comments_update_own); moderator menyembunyikan
    // lewat RPC mod_apply_action. Trigger sync_comment_count menyesuaikan
    // comment_count post (PRD 16.3).
    const { count, error } = await supabase
      .from("comments")
      .update({ is_deleted: true }, { count: "exact" })
      .eq("id", commentId);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      // RLS menyaring diam-diam → bedakan sebab lewat view (PRD 20):
      // tidak ada → NOT_FOUND; milik sendiri tapi ditolak (mis. status akun
      // berubah) → RLS_DENIED; bukan milik → FORBIDDEN.
      const { data } = await supabase
        .from("comments_view")
        .select("is_mine")
        .eq("id", commentId)
        .maybeSingle();
      if (!data) {
        return failure(appError("NOT_FOUND"));
      }
      return failure(appError((data as { is_mine: boolean }).is_mine ? "RLS_DENIED" : "FORBIDDEN"));
    }
    return { ok: true, data: { id: commentId } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
