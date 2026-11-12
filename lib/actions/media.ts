"use server";

/**
 * Server action media video — Pasca-MVP 15 (PRD bagian 15: upload video
 * pendek 30-60 detik, 1 video per post, opsional).
 *
 * Pembagian kerja (Fase 6):
 * - Klien mengompres video sendiri (lib/image/video.ts: canvas 480p +
 *   MediaRecorder, maks 61 detik, target kecil) lalu memanggil uploadVideo
 *   dengan file hasil kompres.
 * - File ini mengunggah file itu ke VERCEL BLOB (bukan Supabase Storage —
 *   video pendek disimpan di store `forum-media`) pada path
 *   `videos/{user_id}/{uuid}.{ext}` dengan akses publik, lalu menyerahkan
 *   URL-nya ke createPost({ videoUrl }) yang menyimpannya ke kolom
 *   posts.video_url (migrasi 0011).
 * - hapusVideo dipakai pemanggil untuk ROLLBACK bila createPost gagal
 *   setelah upload sukses (pola PRD 25.4 untuk foto).
 *
 * Aturan keras:
 * - Env BLOB_READ_WRITE_TOKEN dibaca LAZY di dalam fungsi — `next build`
 *   tanpa token lokal tetap sukses; tanpa token, aksi mengembalikan error
 *   ramah BLOB_UNAVAILABLE ("Belum terhubung ke Vercel Blob").
 * - Pre-cek pengguna: harus login dan is_active_user (status "active";
 *   suspend/ban ditolak FORBIDDEN) — selaras policy RLS posts_insert.
 * - URL yang dikembalikan HANYA disimpan kalau createPost lolos validasi
 *   domain `.public.blob.vercelstorage.com` + folder `videos/{user_id}/`.
 */

import { put, del } from "@vercel/blob";
import {
  appError,
  extractErrorCode,
  type ActionResult,
  type AppError,
  type ErrorCode,
} from "@/lib/errors";
import { getSessionUser } from "./auth";

/** Batas ukuran file video hasil kompres yang diterima server (8 MB). */
const VIDEO_MAX_BYTES = 8 * 1024 * 1024;

/** Tipe MIME video yang diterima server setelah kompres klien. */
const VIDEO_TIPE_DIIZINKAN = [
  "video/webm",
  "video/mp4",
  "video/quicktime",
] as const;

/** Pemetaan MIME → ekstensi path blob. */
const EKSTENSI_VIDEO: Record<(typeof VIDEO_TIPE_DIIZINKAN)[number], string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

/** BLOB_UNAVAILABLE dengan pesan spesifik env hilang (lebih jelas dari bawaan). */
function blobTidakTersedia(): AppError {
  const err = appError("BLOB_UNAVAILABLE");
  return { code: err.code, message: "Belum terhubung ke Vercel Blob." };
}

/**
 * Baca token blob secara lazy (HANYA di dalam fungsi, bukan saat modul
 * dimuat) agar build tanpa env tetap lulus.
 */
function ambilToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/**
 * Cek gate pengguna untuk upload video (PRD: selaku is_active_user):
 * - Tidak login → LOGIN_REQUIRED;
 * - Status bukan "active" (suspend/ban) → FORBIDDEN.
 * (getSessionUser sudah menormalisasi suspend yang kedaluwarsa ke "active".)
 */
async function gatePengguna(): Promise<
  { ok: true; userId: string } | { ok: false; err: AppError }
> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, err: appError("LOGIN_REQUIRED") };
  }
  if (user.status !== "active") {
    return { ok: false, err: appError("FORBIDDEN") };
  }
  return { ok: true, userId: user.id };
}

/**
 * Unggah satu file video hasil kompres klien ke Vercel Blob.
 *
 * Input formData berisi field `file` (File video, SUDAH dikompres di klien —
 * fungsi ini tidak mengompres ulang). Validasi server: tipe MIME dan ukuran
 * ≤ 8 MB (VIDEO_MAX_BYTES) — pelanggaran → VIDEO_INVALID / VIDEO_TOO_LARGE.
 *
 * Sukses → { ok: true, data: { url, pathname } }; URL dikirim ke
 * createPost({ videoUrl }) yang memvalidasi ulang domain + folder milik
 * sendiri sebelum menyimpan ke posts.video_url.
 */
export async function uploadVideo(
  formData: FormData,
): Promise<ActionResult<{ url: string; pathname: string }>> {
  try {
    const gate = await gatePengguna();
    if (!gate.ok) {
      return failure(gate.err);
    }

    const token = ambilToken();
    if (!token) {
      return failure(blobTidakTersedia());
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return failure(appError("VIDEO_INVALID"));
    }
    if (!VIDEO_TIPE_DIIZINKAN.includes(file.type as (typeof VIDEO_TIPE_DIIZINKAN)[number])) {
      return failure(appError("VIDEO_INVALID"));
    }
    if (file.size > VIDEO_MAX_BYTES) {
      return failure(appError("VIDEO_TOO_LARGE"));
    }

    const ekstensi = EKSTENSI_VIDEO[file.type as (typeof VIDEO_TIPE_DIIZINKAN)[number]];
    const pathname = `videos/${gate.userId}/${crypto.randomUUID()}.${ekstensi}`;

    const blob = await put(pathname, file, {
      access: "public",
      token,
    });

    return { ok: true, data: { url: blob.url, pathname: blob.pathname } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

/**
 * Hapus satu video milik pengguna sendiri dari Vercel Blob — untuk ROLLBACK
 * bila createPost gagal setelah uploadVideo sukses (pola PRD 25.4).
 *
 * URL HARUS mengandung folder `videos/{userId}/` — URL milik orang lain
 * ditolak FORBIDDEN. Kegagalan hapus (mis. file sudah tidak ada) TETAP
 * dianggap sukses bagi pemanggil rollback (allSettled aman) — file yatim
 * yang luput dibersihkan job mingguan bersama foto (PRD 20 kasus tepi 3).
 */
export async function hapusVideo(
  url: string,
): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const gate = await gatePengguna();
    if (!gate.ok) {
      return failure(gate.err);
    }

    const alamat = (url ?? "").trim();
    if (!alamat.includes(`videos/${gate.userId}/`)) {
      return failure(appError("FORBIDDEN"));
    }

    const token = ambilToken();
    if (!token) {
      return failure(blobTidakTersedia());
    }

    await del(alamat, { token });
    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
