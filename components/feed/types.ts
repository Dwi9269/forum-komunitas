/**
 * Tipe tampilan (view model) longgar untuk data forum — Fase 3 (FRONTEND).
 *
 * Kontrak aksi BACKEND-AGENT bersifat longgar (view `posts_feed`/`comments_view`
 * PRD; DB memakai snake_case, kontrak aksi memakai camelCase). Agar komponen
 * tidak pernah membaca Supabase langsung dan tetap tahan perbedaan kecil nama
 * field, semua akses field dibungkus normalizer di file ini:
 *   - camelCase DAN snake_case dibaca (mis. `commentCount` / `comment_count`).
 *   - Nilai hilang selalu jatuh ke fallback aman ("" / 0 / null).
 *   - Komunitas bisa berupa string slug ATAU objek { slug, name }.
 *   - Penulis hilang / flag anonim → tampil sebagai "Anonim" (PRD 4.3).
 */

type Rekam = Record<string, unknown>;

function asRekam(nilai: unknown): Rekam | null {
  return typeof nilai === "object" && nilai !== null ? (nilai as Rekam) : null;
}

/** Baca properti pertama yang TERISI dari daftar nama kandidat. */
function baca(sumber: unknown, nama: string[]): unknown {
  const rekam = asRekam(sumber);
  if (!rekam) return undefined;
  for (const k of nama) {
    const nilai = rekam[k];
    if (nilai !== undefined && nilai !== null && nilai !== "") return nilai;
  }
  return undefined;
}

function asTeks(nilai: unknown): string | null {
  return typeof nilai === "string" && nilai.length > 0 ? nilai : null;
}

function asAngka(nilai: unknown, bawaan = 0): number {
  if (typeof nilai === "number" && Number.isFinite(nilai)) return nilai;
  if (typeof nilai === "string" && nilai.trim() !== "") {
    const parsed = Number(nilai);
    if (Number.isFinite(parsed)) return parsed;
  }
  return bawaan;
}

function asAngkaAtauNull(nilai: unknown): number | null {
  if (nilai === undefined || nilai === null || nilai === "") return null;
  const hasil = asAngka(nilai, Number.NaN);
  return Number.isFinite(hasil) ? hasil : null;
}

function jepitVote(nilai: number): number {
  return Math.max(-1, Math.min(1, Math.round(nilai)));
}

// ============================================================
// Post feed (kartu di beranda & halaman komunitas)
// ============================================================

export interface FeedPostView {
  id: string;
  /** Link detail post. */
  href: string;
  communitySlug: string | null;
  communityName: string | null;
  /** null → tampil sebagai "Anonim" (PRD 4.3). */
  authorName: string | null;
  isAnonymous: boolean;
  title: string;
  excerpt: string;
  score: number;
  commentCount: number;
  createdAt: string | null;
  editedAt: string | null;
  /** -1 | 0 | 1 dari view posts_feed (my_vote). */
  myVote: number;
  isMine: boolean;
}

function bacaKomunitas(raw: unknown): { slug: string | null; name: string | null } {
  const nilai = baca(raw, ["community", "communitySlug", "community_slug", "komunitas"]);
  if (typeof nilai === "string") return { slug: nilai, name: null };
  const rekam = asRekam(nilai);
  if (rekam) {
    return {
      slug: asTeks(rekam.slug ?? rekam.id),
      name: asTeks(rekam.name ?? rekam.nama),
    };
  }
  return {
    slug: asTeks(baca(raw, ["communitySlug", "community_slug"])),
    name: asTeks(baca(raw, ["communityName", "community_name"])),
  };
}

function bacaPenulis(raw: unknown): { name: string | null; anonim: boolean } {
  const flagAnonim = baca(raw, ["isAnonymous", "is_anonymous", "anonim"]) === true;
  const penulis = baca(raw, ["author", "username", "authorName", "penulis"]);
  if (typeof penulis === "string") return { name: penulis, anonim: flagAnonim };
  const rekam = asRekam(penulis);
  if (rekam) {
    const nama = asTeks(rekam.username ?? rekam.name);
    return { name: nama, anonim: flagAnonim || !nama };
  }
  // Penulis tidak ada (view menyembunyikan author untuk post anonim) → Anonim.
  return { name: null, anonim: true };
}

export function toFeedPostView(raw: unknown): FeedPostView {
  const komunitas = bacaKomunitas(raw);
  const penulis = bacaPenulis(raw);
  const id = asTeks(baca(raw, ["id"])) ?? "";
  return {
    id,
    href: `/p/${encodeURIComponent(id)}`,
    communitySlug: komunitas.slug,
    communityName: komunitas.name ?? komunitas.slug,
    authorName: penulis.anonim ? null : penulis.name,
    isAnonymous: penulis.anonim,
    title: asTeks(baca(raw, ["title", "judul"])) ?? "(tanpa judul)",
    excerpt:
      asTeks(baca(raw, ["excerpt", "ringkasan"])) ??
      asTeks(baca(raw, ["content", "body", "isi", "contentText"])) ??
      "",
    score: asAngka(baca(raw, ["score", "skor"])),
    commentCount: asAngka(baca(raw, ["commentCount", "comment_count", "jumlahKomentar"])),
    createdAt: asTeks(baca(raw, ["createdAt", "created_at", "waktu"])),
    editedAt: asTeks(baca(raw, ["editedAt", "edited_at"])),
    myVote: jepitVote(asAngka(baca(raw, ["myVote", "my_vote"]))),
    isMine: baca(raw, ["isMine", "is_mine"]) === true,
  };
}

/**
 * Normalisasi hasil getFeed menjadi daftar FeedPostView.
 * Menelusuri beberapa bentuk umum: array langsung, { data: [...] },
 * { data: { items, nextCursor } }, { items: [...] }.
 */
export function toFeedPosts(hasil: unknown): FeedPostView[] {
  if (Array.isArray(hasil)) return hasil.map(toFeedPostView);
  const rekam = asRekam(hasil);
  if (!rekam) return [];
  const dalam = asRekam(rekam.data) ?? asRekam(rekam.items) ?? rekam;
  const kandidat =
    (Array.isArray(rekam.items) && rekam.items) ||
    (Array.isArray(rekam.data) && rekam.data) ||
    (Array.isArray(dalam.items) && dalam.items) ||
    (Array.isArray(dalam.data) && dalam.data);
  return Array.isArray(kandidat) ? kandidat.map(toFeedPostView) : [];
}

/** Ambil kursor pagination dari hasil getFeed (nextCursor / cursor). */
export function bacaCursor(hasil: unknown): string | null {
  const rekam = asRekam(hasil);
  const dalam = asRekam(rekam?.data) ?? rekam;
  return asTeks(baca(dalam, ["nextCursor", "next_cursor", "cursor"]));
}

/** Ambil id resource dari hasil aksi createXxx (data.id / data.post.id / id). */
export function bacaIdDariHasil(hasil: unknown): string | null {
  const rekam = asRekam(hasil);
  const data = asRekam(rekam?.data) ?? rekam;
  if (!data) return null;
  return asTeks(data.id) ?? asTeks(asRekam(data.post)?.id);
}

/**
 * Baca pesan error dari hasil aksi berbentuk { ok: false, code, message }
 * (kontrak BACKEND-AGENT). null berarti hasil bukan kegagalan (atau
 * kegagalan tanpa pesan).
 */
export function pesanGagalHasil(hasil: unknown): string | null {
  if (
    hasil &&
    typeof hasil === "object" &&
    "ok" in hasil &&
    (hasil as { ok?: unknown }).ok === false
  ) {
    const pesan = (hasil as { message?: unknown }).message;
    return typeof pesan === "string" && pesan
      ? pesan
      : "Aksi gagal. Coba lagi.";
  }
  return null;
}

// ============================================================
// Detail post (halaman /p/[id])
// ============================================================

export interface PostDetailView {
  id: string;
  communitySlug: string | null;
  communityName: string | null;
  authorName: string | null;
  isAnonymous: boolean;
  title: string;
  content: string;
  score: number;
  commentCount: number;
  createdAt: string | null;
  editedAt: string | null;
  myVote: number;
  isMine: boolean;
}

export function toPostView(raw: unknown): PostDetailView {
  const komunitas = bacaKomunitas(raw);
  const penulis = bacaPenulis(raw);
  const id = asTeks(baca(raw, ["id"])) ?? "";
  return {
    id,
    communitySlug: komunitas.slug,
    communityName: komunitas.name ?? komunitas.slug,
    authorName: penulis.anonim ? null : penulis.name,
    isAnonymous: penulis.anonim,
    title: asTeks(baca(raw, ["title", "judul"])) ?? "(tanpa judul)",
    content:
      asTeks(baca(raw, ["content", "body", "isi", "contentText"])) ?? "",
    score: asAngka(baca(raw, ["score", "skor"])),
    commentCount: asAngka(baca(raw, ["commentCount", "comment_count", "jumlahKomentar"])),
    createdAt: asTeks(baca(raw, ["createdAt", "created_at", "waktu"])),
    editedAt: asTeks(baca(raw, ["editedAt", "edited_at"])),
    myVote: jepitVote(asAngka(baca(raw, ["myVote", "my_vote"]))),
    isMine: baca(raw, ["isMine", "is_mine"]) === true,
  };
}

/** Normalisasi hasil getPost(id) → { post, comments } (bentuk longgar). */
export function toPostDetail(hasil: unknown): {
  post: PostDetailView | null;
  comments: CommentView[];
} {
  const rekam = asRekam(hasil);
  const kosong: Rekam = {};
  const data: Rekam = asRekam(rekam?.data) ?? rekam ?? kosong;
  // Backend kontrak: data = { post, comments }. Fallback: data langsung post.
  const postRaw = asRekam(data.post) ?? data;
  const post = toPostView(postRaw);
  return { post: post.id ? post : null, comments: toCommentList(data.comments) };
}

// ============================================================
// Komentar bertingkat (CommentNode)
// ============================================================

export interface CommentView {
  id: string;
  authorName: string | null;
  /** true → render abu-abu "[komentar dihapus]" (PRD 18.4.3). */
  isRemoved: boolean;
  body: string;
  createdAt: string | null;
  score: number;
  children: CommentView[];
}

export function toCommentView(raw: unknown): CommentView {
  const penulis = bacaPenulis(raw);
  const anak = baca(raw, ["children", "replies", "balasan", "comments"]);
  return {
    id: asTeks(baca(raw, ["id"])) ?? "",
    authorName: penulis.name,
    isRemoved: baca(raw, ["isRemoved", "is_removed", "dihapus"]) === true,
    body: asTeks(baca(raw, ["body", "content", "isi", "text"])) ?? "",
    createdAt: asTeks(baca(raw, ["createdAt", "created_at"])),
    score: asAngka(baca(raw, ["score", "skor"])),
    children: Array.isArray(anak) ? anak.map(toCommentView) : [],
  };
}

export function toCommentList(sumber: unknown): CommentView[] {
  if (Array.isArray(sumber)) return sumber.map(toCommentView);
  const rekam = asRekam(sumber);
  if (!rekam) return [];
  const dalam = asRekam(rekam.data) ?? rekam;
  const kandidat =
    (Array.isArray(rekam.comments) && rekam.comments) ||
    (Array.isArray(rekam.items) && rekam.items) ||
    (Array.isArray(dalam.comments) && dalam.comments) ||
    (Array.isArray(dalam.items) && dalam.items);
  return Array.isArray(kandidat) ? kandidat.map(toCommentView) : [];
}

// ============================================================
// Komunitas (layout, halaman /c/[slug], form submit)
// ============================================================

export interface CommunityView {
  slug: string;
  name: string;
  description: string | null;
  memberCount: number | null;
  isJoined: boolean;
}

export function toCommunityView(raw: unknown, fallbackSlug?: string): CommunityView {
  const slug = asTeks(baca(raw, ["slug"])) ?? fallbackSlug ?? "";
  const name = asTeks(baca(raw, ["name", "nama"])) ?? slug;
  return {
    slug,
    name,
    description: asTeks(baca(raw, ["description", "deskripsi"])),
    memberCount: asAngkaAtauNull(
      baca(raw, ["memberCount", "member_count", "jumlahAnggota", "members"]),
    ),
    isJoined: baca(raw, ["isJoined", "is_joined", "joined", "sudahGabung"]) === true,
  };
}

/** Normalisasi hasil getCommunities() (array, { data: [...] }, atau { items: [...] }). */
export function toCommunityViews(hasil: unknown): CommunityView[] {
  if (Array.isArray(hasil)) return hasil.map((r) => toCommunityView(r));
  const rekam = asRekam(hasil);
  if (!rekam) return [];
  const dalam = asRekam(rekam.data) ?? asRekam(rekam.items) ?? rekam;
  const kandidat =
    (Array.isArray(rekam.items) && rekam.items) ||
    (Array.isArray(rekam.data) && rekam.data) ||
    (Array.isArray(dalam.items) && dalam.items) ||
    (Array.isArray(dalam.data) && dalam.data);
  return Array.isArray(kandidat) ? kandidat.map((r) => toCommunityView(r)) : [];
}

/** Normalisasi hasil getCommunity(slug) → satu komunitas atau null. */
export function toCommunity(hasil: unknown, fallbackSlug?: string): CommunityView | null {
  const rekam = asRekam(hasil);
  const data = asRekam(rekam?.data) ?? rekam;
  const raw = asRekam(data?.community) ?? data;
  if (!raw) return null;
  const view = toCommunityView(raw, fallbackSlug);
  return view.slug ? view : null;
}

// ============================================================
// Waktu relatif bahasa Indonesia (mis. "2 jam lalu" — PRD 22.1)
// ============================================================

export function waktuRelatif(iso: string | null | undefined): string {
  if (!iso) return "";
  const waktu = new Date(iso).getTime();
  if (!Number.isFinite(waktu)) return "";
  const selisihDetik = Math.round((Date.now() - waktu) / 1000);
  if (selisihDetik < 60) return "baru saja";
  const menit = Math.floor(selisihDetik / 60);
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(waktu));
  } catch {
    return new Date(waktu).toISOString().slice(0, 10);
  }
}
