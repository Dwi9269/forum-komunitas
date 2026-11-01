/**
 * Utilitas bersama untuk form autentikasi (Fase 2).
 *
 * Form-form auth adalah Client Component; semua aksi server dipanggil lewat
 * kontrak `@/lib/actions/auth` (register / login / requestPasswordReset /
 * updatePassword) — TIDAK memanggil Supabase langsung dari komponen.
 *
 * Kontrak hasil aksi (disepakati dengan BACKEND-AGENT):
 *   { ok: true }                       atau { ok: true, needsEmailConfirmation }
 *   { ok: false, code, message }       — code & message ramah dari lib/errors.ts
 */

import { ERROR_MESSAGES, isErrorCode } from "@/lib/errors";

/** Bentuk hasil aksi auth yang dikonsumsi UI. Longgar agar tahan perubahan kecil dari backend. */
export interface AuthActionResult {
  ok: boolean;
  /** Hanya untuk register: apakah pengguna perlu verifikasi email dulu. */
  needsEmailConfirmation?: boolean;
  code?: string;
  message?: string;
}

/** Pesan validasi klien sesuai PRD bagian 21. */
export const PESAN_USERNAME =
  "Username harus 3–20 karakter: huruf, angka, atau garis bawah.";
export const PESAN_PASSWORD_MINIMAL = "Password minimal 8 karakter.";
export const PESAN_EMAIL_KOSONG = "Email wajib diisi.";
export const PESAN_EMAIL_FORMAT = "Format email tidak valid.";

/** Username: 3–20 karakter, a-z A-Z 0-9 _ (PRD 21). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

/** Pemeriksa format email sederhana untuk validasi klien. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ambil pesan siap tampilkan dari hasil aksi yang gagal.
 * Backend biasanya sudah mengirim `message` ramah; bila kosong,
 * fallback ke peta pesan di lib/errors.ts (PRD bagian 20).
 */
export function pesanError(hasil: AuthActionResult): string {
  if (hasil.message) return hasil.message;
  if (isErrorCode(hasil.code)) return ERROR_MESSAGES[hasil.code];
  return "Terjadi kesalahan. Coba lagi.";
}
