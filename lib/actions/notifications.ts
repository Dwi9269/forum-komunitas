"use server";

/**
 * Server actions notifikasi — Pasca-MVP 15 ("Notifikasi dan DM"; DM di luar
 * cakupan sekarang).
 *
 * Kontrak umum (sama dengan lib/actions lain):
 * - Semua aksi memakai klien server Supabase dengan sesi pengguna (RLS aktif)
 *   dari lib/supabase/server.ts. Env dibaca lazy sehingga `next build` tetap
 *   jalan tanpa kredensial asli.
 * - Hasil selalu ActionResult<T>: sukses { ok: true, data }, gagal
 *   { ok: false, code, message } dengan pesan ramah (lib/errors.ts).
 * - Baris notifications TIDAK pernah ditulis klien kecuali kolom is_read:
 *   DB hanya memberi grant SELECT + UPDATE(is_read); INSERT/DELETE milik
 *   trigger security definer (migrasi 0008_notifications.sql).
 * - Notifikasi dibuat trigger DB (komentar/balasan, vote, status akun) —
 *   tidak ada aksi "kirim notifikasi" di sini.
 *
 * Pagination kursor: cursor = offset ter-encode (base64url JSON), pola sama
 * dengan lib/actions/posts.ts — opaque bagi klien.
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

// ============================================================
// Tipe (kontrak untuk UI)
// ============================================================

/** Nilai kolom notifications.tipe (CHECK constraint migrasi 0008). */
export type NotificationTipe =
  | "komentar"
  | "balasan"
  | "vote_post"
  | "vote_comment"
  | "status_akun";

/** Satu item notifikasi, sudah dinormalkan camelCase untuk UI. */
export interface NotificationItem {
  id: string;
  tipe: NotificationTipe;
  /**
   * Teks siap tampil (terisi oleh trigger untuk 'status_akun', mis.
   * "Akunmu disuspend sampai 11 Nov 2026"); null → UI menyusun teks dari
   * tipe + actorUsername.
   */
  pesan: string | null;
  isRead: boolean;
  createdAt: string;
  /** Post tujuan navigasi (untuk status_akun: null). */
  postId: string | null;
  /** Pelaku; null = notifikasi sistem (mis. status akun). */
  actorId: string | null;
  /** Username pelaku (join profiles); null bila pelaku dihapus/sistem. */
  actorUsername: string | null;
  /**
   * true bila post tujuan masih ada & tampil (dibaca lewat view posts_feed,
   * yang memfilter is_hidden/is_deleted) → aman menaut ke /p/<postId>.
   * false → item cukup ditandai dibaca, TANPA navigasi.
   */
  postTersedia: boolean;
}

export interface NotificationsData {
  items: NotificationItem[];
  /** Cursor halaman berikutnya; null berarti halaman terakhir. */
  nextCursor: string | null;
  /** Jumlah notifikasi milik sendiri yang belum dibaca (badge header). */
  unreadCount: number;
}

export interface GetNotificationsParams {
  /** Cursor opaque dari data.nextCursor halaman sebelumnya. */
  cursor?: string;
}

// ============================================================
// Konstanta & helper internal
// ============================================================

/** Ukuran halaman (pola feed: 20 per halaman). */
const NOTIF_LIMIT = 20;

const TIPE_VALID: readonly string[] = [
  "komentar",
  "balasan",
  "vote_post",
  "vote_comment",
  "status_akun",
];

/** UUID v4-ish apa pun bentuknya (kolom id bertipe uuid di DB). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Baris mentah tabel notifications sebelum dinormalkan. */
interface NotificationRow {
  id: string;
  actor_id: string | null;
  tipe: string;
  post_id: string | null;
  pesan: string | null;
  is_read: boolean;
  created_at: string;
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

function narrowTipe(value: string): NotificationTipe {
  return TIPE_VALID.includes(value) ? (value as NotificationTipe) : "komentar";
}

/** Cursor = offset ter-encode (base64url JSON) — pola lib/actions/posts.ts. */
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

function toNotificationItem(
  row: NotificationRow,
  actors: Map<string, string>,
  postsTersedia: Set<string>,
): NotificationItem {
  return {
    id: row.id,
    tipe: narrowTipe(row.tipe),
    pesan: row.pesan,
    isRead: row.is_read,
    createdAt: row.created_at,
    postId: row.post_id,
    actorId: row.actor_id,
    actorUsername: row.actor_id ? actors.get(row.actor_id) ?? null : null,
    postTersedia: row.post_id ? postsTersedia.has(row.post_id) : false,
  };
}

// ============================================================
// Aksi: daftar notifikasi milik sendiri (RLS notifications_select_own)
// ============================================================

export async function getNotifications(
  params: GetNotificationsParams = {},
): Promise<ActionResult<NotificationsData>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }
    const supabase = await createClient();
    const offset = decodeCursor(params.cursor ?? "");

    // RLS menyaring ke baris milik sendiri; urut terbaru, offset kursor.
    const [listHasil, unreadHasil] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, actor_id, tipe, post_id, pesan, is_read, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + NOTIF_LIMIT - 1),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false),
    ]);
    if (listHasil.error) {
      return failure(extractErrorCode(listHasil.error));
    }
    if (unreadHasil.error) {
      return failure(extractErrorCode(unreadHasil.error));
    }

    const rows = (listHasil.data ?? []) as NotificationRow[];

    // Pengayaan non-fatal: username pelaku (join manual ke profiles agar
    // tidak bergantung nama constraint FK) dan ketersediaan post tujuan.
    // posts_feed memfilter is_hidden/is_deleted → id yang hilang berarti
    // konten sudah tidak terlihat (tautan tidak aman untuk navigasi).
    const actorIds = [
      ...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v))),
    ];
    const postIds = [
      ...new Set(rows.map((r) => r.post_id).filter((v): v is string => Boolean(v))),
    ];

    const actors = new Map<string, string>();
    const postsTersedia = new Set<string>();
    try {
      if (actorIds.length > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", actorIds);
        if (error) {
          console.error("getNotifications: gagal memuat username pelaku —", error.message);
        } else {
          for (const row of (data ?? []) as { id: string; username: string }[]) {
            actors.set(row.id, row.username);
          }
        }
      }
      if (postIds.length > 0) {
        const { data, error } = await supabase
          .from("posts_feed")
          .select("id")
          .in("id", postIds);
        if (error) {
          console.error("getNotifications: gagal memeriksa post tujuan —", error.message);
        } else {
          for (const row of (data ?? []) as { id: string }[]) {
            postsTersedia.add(row.id);
          }
        }
      }
    } catch (e) {
      // Pengayaan gagal → item tetap tampil (tanpa username / tanpa tautan).
      console.error("getNotifications: gagal pengayaan notifikasi —", e);
    }

    const items = rows.map((row) => toNotificationItem(row, actors, postsTersedia));
    return {
      ok: true,
      data: {
        items,
        nextCursor:
          rows.length === NOTIF_LIMIT ? encodeCursor(offset + NOTIF_LIMIT) : null,
        unreadCount: unreadHasil.count ?? 0,
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: tandai satu notifikasi dibaca (UPDATE is_read, milik sendiri)
// ============================================================

export async function markNotificationRead(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const notifId = id?.trim() ?? "";
    if (!UUID_PATTERN.test(notifId)) {
      // Bukan bentuk uuid → pasti bukan notifikasi yang sah.
      return failure(appError("NOT_FOUND"));
    }

    const supabase = await createClient();
    // Grant kolom hanya is_read; RLS notifications_update_own membatasi ke
    // baris milik sendiri — update berdampak 0 baris berarti bukan milik /
    // tidak ada → NOT_FOUND.
    const { count, error } = await supabase
      .from("notifications")
      .update({ is_read: true }, { count: "exact" })
      .eq("id", notifId);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      return failure(appError("NOT_FOUND"));
    }
    return { ok: true, data: { id: notifId } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: tandai semua notifikasi dibaca (UPDATE is_read, milik sendiri)
// ============================================================

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ updated: number }>
> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const supabase = await createClient();
    // Tanpa filter id — RLS (notifications_update_own) membatasi ke baris
    // milik sendiri; hanya kolom is_read yang diberi grant ke klien.
    const { count, error } = await supabase
      .from("notifications")
      .update({ is_read: true }, { count: "exact" })
      .eq("is_read", false);
    if (error) {
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: { updated: count ?? 0 } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: jumlah belum dibaca (badge header — layout force-dynamic)
// ============================================================

export async function getUnreadCount(): Promise<ActionResult<number>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);
    if (error) {
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: count ?? 0 };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
