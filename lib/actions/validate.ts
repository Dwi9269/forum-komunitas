/**
 * Validasi cepat di app sebelum menulis ke database (PRD bagian 21; database
 * tetap penjaga terakhir lewat CHECK constraint + trigger). Dipakai bersama
 * oleh lib/actions/posts.ts dan lib/actions/comments.ts.
 *
 * Modul murni (tanpa "use server") — aman diimpor dari client components
 * bila UI butuh batas yang sama.
 */

import { appError, type AppError } from "@/lib/errors";

/** Batas skema posts.title (PRD 8 / 18.3.1). */
export const TITLE_MAX = 200;
/** Batas skema posts.body (PRD 8 / 18.3.1). */
export const BODY_MAX = 10000;
/** Batas skema comments.body (PRD 8 / 18.4.1). */
export const COMMENT_BODY_MIN = 1;
export const COMMENT_BODY_MAX = 5000;

/** Panjang dalam code point — mendekati char_length() PostgreSQL. */
export function charLength(value: string): number {
  return [...value].length;
}

/**
 * Judul post wajib 1–200 karakter SETELAH trim (PRD 18.3.1–2; PRD 20 kasus
 * tepi 8: input dipangkas sebelum divalidasi).
 */
export function validatePostTitle(title: string): AppError | null {
  const len = charLength(title);
  if (len < 1 || len > TITLE_MAX) {
    return appError("TITLE_INVALID");
  }
  return null;
}

/**
 * Isi post opsional, maksimal 10.000 karakter. Skema membolehkan body null
 * (CHECK hanya membatasi panjang), jadi string kosong dianggap tanpa isi.
 */
export function validatePostBody(body: string | null): AppError | null {
  if (body === null) {
    return null;
  }
  if (charLength(body) > BODY_MAX) {
    return appError("BODY_TOO_LONG");
  }
  return null;
}

/** Komentar wajib 1–5.000 karakter setelah trim (PRD 18.4.1). */
export function validateCommentBody(body: string): AppError | null {
  const len = charLength(body);
  if (len < COMMENT_BODY_MIN || len > COMMENT_BODY_MAX) {
    return appError("COMMENT_BODY_INVALID");
  }
  return null;
}
