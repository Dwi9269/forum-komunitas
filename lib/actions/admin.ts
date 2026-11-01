"use server";

/**
 * Server actions antrean moderasi & dashboard admin — PRD bagian 4.6
 * (Mod), 16.6 (RPC mod_apply_action / mod_dismiss_reports), 18.6-18.7
 * (kriteria selesai), 20 (kasus tepi 6 & 9), 24 (baris modAction,
 * modDismiss, getReports, createInvite).
 *
 * Aturan keras yang dijaga file ini:
 * - SEMUA tindakan moderasi lewat RPC `mod_apply_action` / 
 *   `mod_dismiss_reports` (security definer) — TIDAK pernah update tabel
 *   posts/comments/profiles/reports langsung, agar selalu tercatat di
 *   `mod_actions` (PRD 16.6).
 * - Akses dijaga dua lapis: pre-cek role di app (FORBIDDEN cepat) + RLS DB
 *   (is_moderator()/is_admin() menuntut status active). Pre-cek HANYA
 *   melihat role; moderator yang di-suspend tetap ditolak DB
 *   (RLS_DENIED/FORBIDDEN dari RPC) — app tidak menduplikasi cek status.
 *   Peta pre-cek: moderator (moderator|admin) untuk antrean laporan, RPC
 *   moderasi, daftar user, invite, log, dan daftar komunitas; admin penuh
 *   untuk createInvite dan create/update komunitas (RLS comm_admin hanya
 *   mengizinkan admin).
 * - Cuplikan konten target post/komentar dibaca dari TABEL MENTAH
 *   posts/comments (RLS posts_select/comments_select mengizinkan moderator
 *   membaca baris mentah) — BUKAN lewat view, karena post tersembunyi yang
 *   justru perlu ditinjau justru disembunyikan view (PRD 18.6.4). Penulis
 *   asli (termasuk post anonim) ikut disertakan (PRD 20 kasus tepi 9).
 * - Klien tidak pernah menulis status reports (grant kolom DB) — status
 *   berubah hanya via RPC moderasi.
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
import { getSessionUser, type SessionProfile, type UserRole, type UserStatus } from "./auth";

// ============================================================
// Tipe (kontrak untuk MOD-AGENT / UI admin) — nama kolom persis DB
// ============================================================

export type ModerationTargetType = "post" | "comment" | "user";
export type ModerationAction =
  | "hide"
  | "delete"
  | "warn"
  | "suspend"
  | "ban"
  | "restore";
export type ReportStatus = "open" | "resolved" | "dismissed";

/** Cuplikan post untuk antrean (dibaca dari tabel posts mentah). */
export interface ReportPostSnippet {
  kind: "post";
  /** Judul utuh (maks 200 sesuai skema). */
  title: string | null;
  /** Isi dipotong 280 code point (lihat truncate()). */
  body: string | null;
  is_hidden: boolean;
  is_deleted: boolean;
  /** URL publik foto post (urut position). */
  image_urls: string[];
  /** Penulis asli — terisi meski post anonim (PRD 18.6.4, 20 kasus tepi 9). */
  author_id: string | null;
  author_username: string | null;
}

/** Cuplikan komentar untuk antrean (dibaca dari tabel comments mentah). */
export interface ReportCommentSnippet {
  kind: "comment";
  /** Isi dipotong 280 code point. */
  body: string | null;
  /** Semantik comments_view: tersembunyi ATAU terhapus. */
  is_removed: boolean;
  author_id: string | null;
  author_username: string | null;
}

export type ReportTargetSnippet = ReportPostSnippet | ReportCommentSnippet;

/** Satu baris laporan untuk antrean (kolom reports + pengayaan). */
export interface ReportItem {
  id: string;
  reporter_id: string;
  reporter_username: string | null;
  target_type: ModerationTargetType;
  target_id: string;
  /** Salah satu: spam | porn | violence_sara | doxxing | other (PRD 4.6). */
  reason: string;
  note: string | null;
  status: ReportStatus;
  created_at: string;
  /**
   * Jumlah laporan pada antrean ini untuk target yang sama — antrean
   * diurutkan dari yang paling banyak dilaporkan (PRD 18.6.4).
   */
  report_count: number;
  /** null bila target bukan post/komentar, atau barisnya sudah tidak ada. */
  target_snippet: ReportTargetSnippet | null;
}

export interface ModApplyActionInput {
  action: ModerationAction;
  targetType: ModerationTargetType;
  targetId: string;
  /** Alasan yang dicatat di mod_actions; string kosong → null. */
  reason: string;
  /** Lama suspend dalam hari (RPC default 3; UI PRD 18.6.5: 1/3/7/30). */
  days?: number;
}

export interface ModDismissReportsInput {
  targetType: ModerationTargetType;
  targetId: string;
}

export interface AdminUserItem {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  suspended_until: string | null;
  created_at: string;
}

export interface InviteItem {
  code: string;
  created_by: string | null;
  created_by_username: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface CreateInviteInput {
  /** 1–1000 (dipakai berapa kali kode boleh ditebus). */
  maxUses: number;
  /** ISO tanggal kedaluwarsa; opsional. */
  expiresAt?: string;
}

/** Komunitas + angka statistik dari view community_stats (DB Fase 4). */
export interface AdminCommunityItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  /** null bila view community_stats belum tersedia di DB. */
  member_count: number | null;
  post_count: number | null;
}

export interface CreateCommunityInput {
  slug: string;
  name: string;
  description?: string;
}

export interface UpdateCommunityInput {
  id: string;
  name?: string;
  description?: string;
}

/** Satu baris log moderasi (mod_actions + username moderator). */
export interface ModActionItem {
  id: string;
  moderator_id: string;
  moderator_username: string | null;
  action: ModerationAction;
  target_type: ModerationTargetType;
  target_id: string;
  reason: string | null;
  created_at: string;
}

// ============================================================
// Konstanta & helper internal
// ============================================================

/** Aksi yang dikenal RPC mod_apply_action (PRD 16.6). */
const MOD_ACTIONS: readonly ModerationAction[] = [
  "hide",
  "delete",
  "warn",
  "suspend",
  "ban",
  "restore",
];
const MOD_TARGET_TYPES: readonly ModerationTargetType[] = [
  "post",
  "comment",
  "user",
];

const REPORTS_MAX = 500; // batas aman antrean per permintaan
const INVITES_MAX = 200;
const USERS_MAX = 50; // PRD 18.6 / kontrak: limit 50
const MOD_LOG_MAX = 500;
const MOD_LOG_DEFAULT = 100;
const SNIPPET_MAX = 280;
const NAME_MAX = 80;
const MAX_USES_MAX = 1000;
const DAYS_MAX = 365;
const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

/** Potong teks pada batas code point (mendekati char_length() PostgreSQL). */
function truncate(value: string | null, max: number): string | null {
  if (value === null) {
    return null;
  }
  const chars = [...value];
  return chars.length <= max ? value : chars.slice(0, max).join("");
}

/** Guard sesi + role: pre-cek cepat sebelum menyentuh DB. */
type Guarded =
  | { ok: true; user: SessionProfile }
  | { ok: false; error: AppError };

async function guardRole(minimum: "moderator" | "admin"): Promise<Guarded> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: appError("LOGIN_REQUIRED") };
  }
  const isModerator = user.role === "moderator" || user.role === "admin";
  const allowed = minimum === "admin" ? user.role === "admin" : isModerator;
  if (!allowed) {
    return { ok: false, error: appError("FORBIDDEN") };
  }
  return { ok: true, user };
}

/** UUID bentuk apa pun (kolom target_id bertipe uuid). */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    e?.code === "23505" ||
    (e?.message ?? "").toLowerCase().includes("duplicate key")
  );
}

/**
 * Baca baris bantu per batch 100 id (hindari URL PostgREST terlalu panjang).
 * Gagal dibaca = array kosong + log — antrean laporan tetap tampil tanpa
 * pengayaan, jangan bawa down seluruh dashboard karena satu bacaan sekunder.
 */
async function selectChunks<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  if (unique.length === 0) {
    return out;
  }
  try {
    for (let i = 0; i < unique.length; i += 100) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(column, unique.slice(i, i + 100));
      if (error) {
        console.error(`admin: gagal membaca ${table}:`, error.message);
        return out;
      }
      out.push(...((data ?? []) as T[]));
    }
  } catch (e) {
    console.error(`admin: gagal membaca ${table}:`, e);
  }
  return out;
}

/** Peta id → username dari tabel profiles (RLS profiles_select: semua authenticated). */
async function fetchUsernames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const rows = await selectChunks<{ id: string; username: string }>(
    supabase,
    "profiles",
    "id, username",
    "id",
    ids,
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.username) {
      map.set(row.id, row.username);
    }
  }
  return map;
}

/** Peta post_id → URL publik foto (urut position) dari post_images. */
async function fetchImageUrls(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Map<string, string[]>> {
  const rows = await selectChunks<{
    post_id: string;
    storage_path: string;
    position: number;
  }>(supabase, "post_images", "post_id, storage_path, position", "post_id", postIds);
  rows.sort((a, b) => a.position - b.position);
  const bucket = supabase.storage.from("post-images");
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.post_id) ?? [];
    list.push(bucket.getPublicUrl(row.storage_path).data.publicUrl);
    map.set(row.post_id, list);
  }
  return map;
}

/** Kode undangan 8 karakter A-Z0-9 acak (dibuat server, PRD 18.6 / 24). */
function generateInviteCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

// ============================================================
// Antrean laporan (PRD 24 getReports; PRD 18.6.4)
// ============================================================

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
}

interface PostRow {
  id: string;
  title: string;
  body: string | null;
  is_hidden: boolean;
  is_deleted: boolean;
  author_id: string;
}

interface CommentRow {
  id: string;
  body: string | null;
  is_hidden: boolean;
  is_deleted: boolean;
  author_id: string;
}

export async function getReports(
  status?: ReportStatus,
): Promise<ActionResult<{ reports: ReportItem[] }>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }
    const supabase = await createClient();

    // Antrean terbaru dulu, dibatasi 500 (status di luar tiga nilai dikenal
    // diabaikan = tanpa filter).
    let query = supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(REPORTS_MAX);
    if (status === "open" || status === "resolved" || status === "dismissed") {
      query = query.eq("status", status);
    }
    const { data, error } = await query;
    if (error) {
      return failure(extractErrorCode(error));
    }
    const rows = (data ?? []) as ReportRow[];

    // Hitung laporan per target untuk urutan "paling banyak dilaporkan"
    // (PRD 18.6.4) — dihitung dalam jendela antrean yang sama.
    const countKey = (row: ReportRow) => `${row.target_type}:${row.target_id}`;
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(countKey(row), (counts.get(countKey(row)) ?? 0) + 1);
    }
    rows.sort((a, b) => {
      const diff = (counts.get(countKey(b)) ?? 0) - (counts.get(countKey(a)) ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });

    // Kumpulkan target post/komentar + pelapor untuk pengayaan. Post/
    // komentar dibaca dari TABEL MENTAH (moderator lolos RLS posts_select/
    // comments_select) karena post yang perlu ditinjau justru tersembunyi
    // dari view.
    const postIds = rows.filter((r) => r.target_type === "post").map((r) => r.target_id);
    const commentIds = rows
      .filter((r) => r.target_type === "comment")
      .map((r) => r.target_id);
    const [postRows, commentRows, imageMap, reporterNames] = await Promise.all([
      selectChunks<PostRow>(supabase, "posts", "id, title, body, is_hidden, is_deleted, author_id", "id", postIds),
      selectChunks<CommentRow>(supabase, "comments", "id, body, is_hidden, is_deleted, author_id", "id", commentIds),
      fetchImageUrls(supabase, postIds),
      fetchUsernames(supabase, rows.map((r) => r.reporter_id)),
    ]);

    // Username penulis butuh postRows/commentRows → ambil setelahnya.
    const authorIds = [
      ...postRows.map((p) => p.author_id),
      ...commentRows.map((c) => c.author_id),
    ];
    const authorNames = await fetchUsernames(supabase, authorIds);
    for (const [id, name] of reporterNames) authorNames.set(id, name);

    const postMap = new Map(postRows.map((p) => [p.id, p]));
    const commentMap = new Map(commentRows.map((c) => [c.id, c]));

    const reports: ReportItem[] = rows.map((row) => {
      const post = postMap.get(row.target_id);
      const comment = commentMap.get(row.target_id);
      let snippet: ReportTargetSnippet | null = null;
      if (row.target_type === "post" && post) {
        snippet = {
          kind: "post",
          title: post.title,
          body: truncate(post.body, SNIPPET_MAX),
          is_hidden: post.is_hidden,
          is_deleted: post.is_deleted,
          image_urls: imageMap.get(row.target_id) ?? [],
          author_id: post.author_id,
          author_username: authorNames.get(post.author_id) ?? null,
        };
      } else if (row.target_type === "comment" && comment) {
        snippet = {
          kind: "comment",
          body: truncate(comment.body, SNIPPET_MAX),
          is_removed: comment.is_hidden || comment.is_deleted,
          author_id: comment.author_id,
          author_username: authorNames.get(comment.author_id) ?? null,
        };
      }
      return {
        id: row.id,
        reporter_id: row.reporter_id,
        reporter_username: authorNames.get(row.reporter_id) ?? null,
        target_type: row.target_type as ModerationTargetType,
        target_id: row.target_id,
        reason: row.reason,
        note: row.note,
        status: row.status as ReportStatus,
        created_at: row.created_at,
        report_count: counts.get(countKey(row)) ?? 1,
        target_snippet: snippet,
      };
    });

    return { ok: true, data: { reports } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Tindakan moderasi via RPC (PRD 24 modAction/modDismiss; PRD 16.6)
// ============================================================

export async function modApplyAction(
  input: ModApplyActionInput,
): Promise<ActionResult<null>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }

    // Validasi cepat — pesan sama dengan yang dilempar RPC (PRD 16.6):
    // FORBIDDEN, ACTION_INVALID, TARGET_INVALID, NOT_FOUND.
    const action = input.action;
    if (!MOD_ACTIONS.includes(action)) {
      return failure(appError("ACTION_INVALID"));
    }
    const targetType = input.targetType;
    if (!MOD_TARGET_TYPES.includes(targetType)) {
      return failure(appError("TARGET_INVALID"));
    }
    const targetId = input.targetId?.trim() ?? "";
    if (!isUuid(targetId)) {
      return failure(appError("TARGET_INVALID"));
    }
    if (targetType === "user" && (action === "hide" || action === "delete")) {
      return failure(appError("ACTION_INVALID"));
    }
    const days = input.days;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > DAYS_MAX)) {
      return failure(appError("ACTION_INVALID"));
    }

    const supabase = await createClient();
    const reason = (input.reason ?? "").trim();
    const args: {
      p_action: string;
      p_target_type: string;
      p_target_id: string;
      p_reason: string | null;
      p_days?: number;
    } = {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason === "" ? null : reason,
    };
    if (days !== undefined) {
      args.p_days = days; // dihapus dari payload → RPC memakai default 3
    }

    // RPC security definer: memvalidasi role + kombinasi aksi/target,
    // menonaktifkan/mengembalikan konten, menutup laporan open (kecuali
    // restore), dan mencatat mod_actions (PRD 16.6).
    const { error } = await supabase.rpc("mod_apply_action", args);
    if (error) {
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: null };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

export async function modDismissReports(
  input: ModDismissReportsInput,
): Promise<ActionResult<null>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }

    const targetType = input.targetType;
    if (!MOD_TARGET_TYPES.includes(targetType)) {
      return failure(appError("TARGET_INVALID"));
    }
    const targetId = input.targetId?.trim() ?? "";
    if (!isUuid(targetId)) {
      return failure(appError("TARGET_INVALID"));
    }

    const supabase = await createClient();
    // Menolak laporan: status open → dismissed + tampilkan kembali konten
    // yang tersembunyi otomatis (PRD 16.6 / 18.6.5 "Tolak laporan").
    const { error } = await supabase.rpc("mod_dismiss_reports", {
      p_target_type: targetType,
      p_target_id: targetId,
    });
    if (error) {
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: null };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Daftar user (untuk pilih target suspend/ban, PRD 4.6)
// ============================================================

export async function listUsers(
  search?: string,
): Promise<ActionResult<{ users: AdminUserItem[] }>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }
    const supabase = await createClient();

    // % _ punya makna khusus ilike → diganti spasi (pola sama dengan pencarian feed).
    const term = (search ?? "").replace(/[%_]/g, " ").trim();
    let query = supabase
      .from("profiles")
      .select("id, username, role, status, suspended_until, created_at");
    if (term) {
      query = query.ilike("username", `%${term}%`);
    }
    const { data, error } = await query
      .order("username", { ascending: true })
      .limit(USERS_MAX);
    if (error) {
      return failure(extractErrorCode(error));
    }
    const users = ((data ?? []) as {
      id: string;
      username: string;
      role: string;
      status: string;
      suspended_until: string | null;
      created_at: string;
    }[]).map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role as UserRole,
      status: row.status as UserStatus,
      suspended_until: row.suspended_until,
      created_at: row.created_at,
    }));
    return { ok: true, data: { users } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Kode undangan (PRD 24 createInvite; PRD 4.1 akses via undangan)
// ============================================================

export async function listInvites(): Promise<ActionResult<{ invites: InviteItem[] }>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("invite_codes")
      .select("code, created_by, max_uses, used_count, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(INVITES_MAX);
    if (error) {
      return failure(extractErrorCode(error));
    }
    const rows = (data ?? []) as {
      code: string;
      created_by: string | null;
      max_uses: number;
      used_count: number;
      expires_at: string | null;
      created_at: string;
    }[];
    const usernames = await fetchUsernames(
      supabase,
      rows.map((r) => r.created_by ?? "").filter(Boolean),
    );
    const invites: InviteItem[] = rows.map((row) => ({
      code: row.code,
      created_by: row.created_by,
      created_by_username: row.created_by
        ? usernames.get(row.created_by) ?? null
        : null,
      max_uses: row.max_uses,
      used_count: row.used_count,
      expires_at: row.expires_at,
      created_at: row.created_at,
    }));
    return { ok: true, data: { invites } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<ActionResult<{ code: string }>> {
  try {
    const guard = await guardRole("admin");
    if (!guard.ok) {
      return failure(guard.error);
    }

    const maxUses = input?.maxUses;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES_MAX) {
      return failure(appError("INVITE_INPUT_INVALID"));
    }
    let expiresAt: string | null = null;
    if (input.expiresAt !== undefined && input.expiresAt !== "") {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return failure(appError("INVITE_INPUT_INVALID"));
      }
      expiresAt = parsed.toISOString();
    }

    const supabase = await createClient();

    // Kode dibuat server (8 char A-Z0-9). Tabrakan kode (unique) dicoba
    // ulang maksimal 5 kali — kemungkinan sangat kecil (36^8).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      // Grant kolom DB hanya (code, created_by, max_uses, expires_at);
      // used_count hanya diubah trigger handle_new_user (migrasi 0003).
      const { data, error } = await supabase
        .from("invite_codes")
        .insert({
          code,
          created_by: guard.user.id,
          max_uses: maxUses,
          expires_at: expiresAt,
        })
        .select("code")
        .single();
      if (!error) {
        return { ok: true, data: { code: (data as { code: string }).code } };
      }
      if (!isUniqueViolation(error)) {
        return failure(extractErrorCode(error));
      }
    }
    return failure(appError("UNKNOWN"));
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Komunitas (dashboard admin; RLS comm_admin hanya admin)
// ============================================================

interface StatsRow {
  community_id: string;
  member_count: number | null;
  post_count: number | null;
}

export async function listCommunitiesAdmin(): Promise<ActionResult<{ communities: AdminCommunityItem[] }>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("communities")
      .select("id, slug, name, description, created_at")
      .order("name", { ascending: true });
    if (error) {
      return failure(extractErrorCode(error));
    }

    // Statistik dari view community_stats (DB-AGENT Fase 4). View belum ada
    // / belum terbaca → angka null (bukan error) — halaman tetap tampil.
    const stats = new Map<string, StatsRow>();
    try {
      const { data: statRows, error: statError } = await supabase
        .from("community_stats")
        .select("community_id, member_count, post_count");
      if (statError) {
        console.warn(
          "listCommunitiesAdmin: view community_stats tidak terbaca —",
          statError.message,
        );
      } else {
        for (const row of (statRows ?? []) as StatsRow[]) {
          stats.set(row.community_id, row);
        }
      }
    } catch (e) {
      console.warn("listCommunitiesAdmin: view community_stats tidak tersedia —", e);
    }

    const communities = ((data ?? []) as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      created_at: string;
    }[]).map((row) => ({
      ...row,
      member_count: stats.get(row.id)?.member_count ?? null,
      post_count: stats.get(row.id)?.post_count ?? null,
    }));
    return { ok: true, data: { communities } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

export async function createCommunity(
  input: CreateCommunityInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const guard = await guardRole("admin");
    if (!guard.ok) {
      return failure(guard.error);
    }

    const slug = input.slug?.trim() ?? "";
    if (!SLUG_PATTERN.test(slug)) {
      return failure(appError("COMMUNITY_INVALID"));
    }
    const name = input.name?.trim() ?? "";
    if (name.length < 1 || [...name].length > NAME_MAX) {
      return failure(appError("COMMUNITY_INVALID"));
    }
    const description = input.description?.trim() ?? "";

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("communities")
      .insert({
        slug,
        name,
        description: description === "" ? null : description,
      })
      .select("id, slug")
      .single();
    if (error) {
      if (isUniqueViolation(error) && (error.message ?? "").includes("slug")) {
        return failure(appError("COMMUNITY_SLUG_TAKEN"));
      }
      return failure(extractErrorCode(error));
    }
    return {
      ok: true,
      data: { id: (data as { id: string }).id, slug: (data as { slug: string }).slug },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

export async function updateCommunity(
  input: UpdateCommunityInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const guard = await guardRole("admin");
    if (!guard.ok) {
      return failure(guard.error);
    }

    const id = input.id?.trim() ?? "";
    if (!isUuid(id)) {
      return failure(appError("NOT_FOUND"));
    }

    const patch: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || [...name].length > NAME_MAX) {
        return failure(appError("COMMUNITY_INVALID"));
      }
      patch.name = name;
    }
    if (input.description !== undefined) {
      const description = input.description.trim();
      patch.description = description === "" ? null : description;
    }
    if (Object.keys(patch).length === 0) {
      return { ok: true, data: { id } }; // tidak ada perubahan
    }

    const supabase = await createClient();
    const { count, error } = await supabase
      .from("communities")
      .update(patch, { count: "exact" })
      .eq("id", id);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      // Pre-cek admin sudah lolos → 0 baris berarti id tidak ditemukan.
      return failure(appError("NOT_FOUND"));
    }
    return { ok: true, data: { id } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Log moderasi (PRD 4.6 "Log tindakan moderasi")
// ============================================================

export async function getModLog(
  limit: number = MOD_LOG_DEFAULT,
): Promise<ActionResult<{ actions: ModActionItem[] }>> {
  try {
    const guard = await guardRole("moderator");
    if (!guard.ok) {
      return failure(guard.error);
    }
    const supabase = await createClient();

    const parsed = Math.trunc(Number(limit));
    const safeLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), MOD_LOG_MAX)
      : MOD_LOG_DEFAULT;

    const { data, error } = await supabase
      .from("mod_actions")
      .select("id, moderator_id, action, target_type, target_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) {
      return failure(extractErrorCode(error));
    }
    const rows = (data ?? []) as {
      id: string;
      moderator_id: string;
      action: string;
      target_type: string;
      target_id: string;
      reason: string | null;
      created_at: string;
    }[];
    const usernames = await fetchUsernames(
      supabase,
      rows.map((r) => r.moderator_id),
    );
    const actions: ModActionItem[] = rows.map((row) => ({
      id: row.id,
      moderator_id: row.moderator_id,
      moderator_username: usernames.get(row.moderator_id) ?? null,
      action: row.action as ModerationAction,
      target_type: row.target_type as ModerationTargetType,
      target_id: row.target_id,
      reason: row.reason,
      created_at: row.created_at,
    }));
    return { ok: true, data: { actions } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
