/**
 * Peta kode error database ke pesan ramah (PRD bagian 20 "Kasus Tepi dan
 * Pesan Error") plus kode dari kontrak aksi (PRD bagian 24).
 *
 * Database melempar kode lewat `raise exception`, mis.:
 *   raise exception '(INVITE_INVALID) Kode undangan tidak valid';
 * PostgREST menyampaikannya sebagai message "(INVITE_INVALID) ...".
 * Gunakan extractErrorCode() untuk mengubah error apa pun (PostgREST,
 * auth supabase-js, kegagalan jaringan) menjadi { code, message }
 * siap ditampilkan ke pengguna.
 */

/** Semua kode error yang dikenal aplikasi. */
export type ErrorCode =
  // Kode dari PRD bagian 20
  | "INVITE_INVALID"
  | "USERNAME_INVALID"
  | "RATE_LIMIT"
  | "PARENT_INVALID"
  | "PARENT_UNAVAILABLE"
  | "DEPTH_EXCEEDED"
  | "POST_UNAVAILABLE"
  | "FORBIDDEN"
  // Kode dari kontrak aksi moderasi (PRD bagian 24: modAction)
  | "ACTION_INVALID"
  | "NOT_FOUND"
  // Kondisi tanpa kode eksplisit dari database (PRD bagian 20)
  | "RLS_DENIED" // "RLS menolak"
  | "NETWORK" // "Gagal jaringan"
  // Kode alur autentikasi (PRD bagian 19 + 21; tidak ada di tabel PRD 20).
  // Tambahan BACKEND-AGENT Fase 2: dipetakan dari error auth Supabase
  // (email/password) dan validasi app di lib/actions/auth.ts.
  | "LOGIN_INVALID" // kredensial salah saat login
  | "EMAIL_NOT_CONFIRMED" // login sebelum verifikasi email
  | "ACCOUNT_SUSPENDED" // login dengan akun berstatus suspended
  | "ACCOUNT_BANNED" // login dengan akun berstatus banned
  | "EMAIL_INVALID" // format email salah (validasi app, PRD 21)
  | "EMAIL_TAKEN" // email sudah terdaftar (kontrak signUp, PRD 24)
  | "USERNAME_TAKEN" // username sudah dipakai (PRD 18.1.3)
  | "PASSWORD_WEAK" // password < 8 karakter (PRD 21)
  | "PASSWORD_MISMATCH" // konfirmasi password tidak sama
  | "PASSWORD_SAME" // password baru sama dengan lama (auth Supabase)
  // Kode alur konten (Fase 3, BACKEND-AGENT): tidak ada di tabel PRD 20;
  // diperlukan untuk sesi dan validasi cepat PRD 21 (pola yang sama dengan
  // kode alur auth Fase 2).
  | "LOGIN_REQUIRED" // aksi data memerlukan sesi login
  | "TITLE_INVALID" // judul post kosong atau > 200 karakter (PRD 21)
  | "BODY_TOO_LONG" // isi post > 10.000 karakter (PRD 21)
  | "COMMENT_BODY_INVALID" // komentar bukan 1–5.000 karakter (PRD 21)
  | "VOTE_INVALID" // tipe/nilai vote tidak dikenal (PRD 24 setVote)
  // Kode moderasi, foto, dan profil (Fase 4, BACKEND-AGENT): validasi cepat
  // app + kode yang dilempar DB (TARGET_INVALID oleh RPC mod_apply_action).
  | "REPORT_DUPLICATE" // laporan sama oleh user sama sudah ada (PRD 18.6.2)
  | "REPORT_INVALID" // alasan/tipe target laporan tidak dikenal
  | "TARGET_INVALID" // tipe target moderasi tidak dikenal (RPC 16.6)
  | "IMAGE_INVALID" // foto tidak valid (bukan 1–4 path milik sendiri)
  | "BIO_TOO_LONG" // bio > 200 karakter (PRD 21 / skema profiles)
  | "AVATAR_INVALID" // URL avatar bukan URL publik bucket avatars
  | "COMMUNITY_INVALID" // slug/nama komunitas tidak valid (dashboard admin)
  | "COMMUNITY_SLUG_TAKEN" // slug komunitas sudah dipakai (unique)
  | "INVITE_INPUT_INVALID" // max_uses/expires_at kode undangan tidak valid
  | "REGISTRATION_REJECTED" // signUp ditolak trigger tapi pesannya disamarkan GoTrue
  // Kode alur video (Pasca-MVP 15, MEDIA-AGENT): video pendek dikompres di
  // klien lalu diunggah ke Vercel Blob lewat lib/actions/media.ts.
  | "VIDEO_TOO_LARGE" // video terlalu besar setelah dikompres (> 8 MB server)
  | "VIDEO_DURATION" // durasi video melebihi 60 detik
  | "VIDEO_INVALID" // format video tidak didukung / URL video tidak sah
  | "BLOB_UNAVAILABLE" // Vercel Blob belum terhubung (env token hilang)
  | "UNKNOWN"; // fallback

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVITE_INVALID:
    "Kode undangan tidak valid, sudah dipakai habis, atau kedaluwarsa.",
  USERNAME_INVALID: "Username harus 3–20 karakter: huruf, angka, atau garis bawah.",
  REGISTRATION_REJECTED:
    "Pendaftaran ditolak. Pastikan kode undangan masih berlaku dan username belum dipakai orang lain, lalu coba lagi.",
  RATE_LIMIT: "Kamu terlalu cepat. Tunggu beberapa menit lalu coba lagi.",
  PARENT_INVALID: "Komentar yang kamu balas tidak ditemukan.",
  PARENT_UNAVAILABLE: "Komentar yang kamu balas sudah dihapus.",
  DEPTH_EXCEEDED: "Balasan sudah terlalu dalam. Balas komentar di atasnya.",
  POST_UNAVAILABLE: "Post ini sudah dihapus atau disembunyikan.",
  FORBIDDEN: "Kamu tidak punya izin untuk aksi ini.",
  ACTION_INVALID: "Aksi moderasi tidak dikenal.",
  NOT_FOUND: "Data tidak ditemukan.",
  RLS_DENIED: "Akunmu tidak bisa melakukan aksi ini saat ini. Cek status akunmu.",
  NETWORK: "Koneksi bermasalah. Coba lagi.",
  LOGIN_INVALID: "Email atau password salah.",
  EMAIL_NOT_CONFIRMED:
    "Email belum diverifikasi. Cek kotak masuk untuk tautan verifikasi.",
  ACCOUNT_SUSPENDED:
    "Akunmu sedang disuspend. Tunggu sampai masa sanksi berakhir.",
  ACCOUNT_BANNED: "Akunmu diblokir. Untuk banding, hubungi admin lewat email.",
  EMAIL_INVALID: "Format email tidak valid.",
  EMAIL_TAKEN: "Email sudah terdaftar. Coba login atau gunakan lupa password.",
  USERNAME_TAKEN: "Username sudah dipakai. Pilih username lain.",
  PASSWORD_WEAK: "Password minimal 8 karakter.",
  PASSWORD_MISMATCH: "Konfirmasi password tidak sama dengan password baru.",
  PASSWORD_SAME: "Password baru sama dengan password lama.",
  LOGIN_REQUIRED: "Kamu harus login untuk melakukan aksi ini.",
  TITLE_INVALID: "Judul wajib diisi dan maksimal 200 karakter.",
  BODY_TOO_LONG: "Isi post maksimal 10.000 karakter.",
  COMMENT_BODY_INVALID: "Komentar harus 1–5.000 karakter.",
  VOTE_INVALID: "Nilai vote tidak dikenal.",
  REPORT_DUPLICATE: "Kamu sudah melaporkan ini.",
  REPORT_INVALID: "Pilihan alasan laporan tidak valid.",
  TARGET_INVALID: "Target tindakan moderasi tidak dikenal.",
  IMAGE_INVALID: "Foto tidak valid. Maksimal 4 foto per post.",
  BIO_TOO_LONG: "Bio maksimal 200 karakter.",
  AVATAR_INVALID: "URL avatar tidak valid. Unggah avatar melalui bucket avatars.",
  COMMUNITY_INVALID: "Slug atau nama komunitas tidak valid.",
  COMMUNITY_SLUG_TAKEN: "Slug komunitas sudah dipakai. Pilih slug lain.",
  INVITE_INPUT_INVALID: "Data kode undangan tidak valid.",
  VIDEO_TOO_LARGE: "Video terlalu besar setelah dikompres.",
  VIDEO_DURATION: "Video maksimal 60 detik.",
  VIDEO_INVALID: "Format video tidak didukung.",
  BLOB_UNAVAILABLE: "Penyimpanan video belum terhubung.",
  UNKNOWN: "Terjadi kesalahan. Coba lagi.",
};

/** Bentuk hasil standar untuk UI: kode + pesan ramah siap tampilkan. */
export interface AppError {
  code: ErrorCode;
  message: string;
}

/**
 * Bentuk hasil standar semua server action data (PRD bagian 24): sukses
 * `{ ok: true, data }`, gagal `{ ok: false, code, message }` ramah UI.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(
  Object.keys(ERROR_MESSAGES),
);

/** Type guard: apakah nilai ini salah satu ErrorCode yang dikenal? */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value);
}

/** Buat AppError dari kode yang sudah pasti. */
export function appError(code: ErrorCode): AppError {
  return { code, message: ERROR_MESSAGES[code] };
}

/**
 * Pola "(CODE) detail" yang dipakai database saat `raise exception`.
 * Contoh: "(INVITE_INVALID) Kode undangan tidak valid ...".
 */
const CODE_IN_MESSAGE = /\(([A-Z][A-Z0-9_]{2,})\)/;

/** Prefiks kode di awal message tanpa kurung, mis. "RATE_LIMIT ...". */
const CODE_PREFIX = /^[A-Z][A-Z0-9_]{2,}/;

/** Ciri kegagalan jaringan dari fetch/browser supabase-js (huruf kecil). */
const NETWORK_HINTS = [
  "failed to fetch",
  "fetch failed",
  "network request failed",
  "networkerror",
  "load failed",
  "econnrefused",
  "enotfound",
  "etimedout",
];

/** Deteksi penolakan RLS: SQLSTATE insufficient_privilege atau teksnya. */
const RLS_PATTERN = /\brow[- ]level security\b|\brls\b/i;

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    isErrorCode((value as { code?: unknown }).code) &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/**
 * Ekstrak kode error dari error Supabase/PostgREST dan petakan menjadi
 * { code, message } dengan pesan ramah bahasa Indonesia (PRD bagian 20).
 * Tidak pernah melempar — error apa pun menghasilkan AppError.
 *
 * Urutan deteksi:
 *  1. Nilai sudah berbentuk AppError → langsung dipakai.
 *  2. Kegagalan jaringan → NETWORK.
 *  3. RLS menolak (SQLSTATE 42501 / pesan row-level security) → RLS_DENIED.
 *  4. Properti error.code berisi kode domain yang dikenal.
 *  5. Message berformat "(CODE) detail" atau "CODE ..." dari raise exception.
 *  6. Tidak dikenal → UNKNOWN.
 */
export function extractErrorCode(error: unknown): AppError {
  // 1) Sudah berbentuk AppError
  if (isAppError(error)) {
    return error;
  }

  const maybe = error as
    | { code?: unknown; message?: unknown; name?: unknown }
    | null
    | undefined;
  const code = typeof maybe?.code === "string" ? maybe.code : "";
  const message = typeof maybe?.message === "string" ? maybe.message : "";
  const name = typeof maybe?.name === "string" ? maybe.name : "";
  const haystack = `${name} ${code} ${message}`.toLowerCase();

  // 2) Jaringan gagal → "Gagal jaringan"
  if (NETWORK_HINTS.some((hint) => haystack.includes(hint))) {
    return appError("NETWORK");
  }

  // 3) RLS menolak → "Akunmu tidak bisa melakukan aksi ini saat ini..."
  if (code === "42501" || RLS_PATTERN.test(haystack)) {
    return appError("RLS_DENIED");
  }

  // 4) Kode domain ada di properti code (mis. hasil rpc / error terstruktur)
  if (isErrorCode(code)) {
    return appError(code);
  }

  // 5) Kode di dalam message: "(CODE) detail" atau "CODE ..."
  const inParen = CODE_IN_MESSAGE.exec(message);
  if (inParen && isErrorCode(inParen[1])) {
    return appError(inParen[1]);
  }
  const asPrefix = CODE_PREFIX.exec(message);
  if (asPrefix && isErrorCode(asPrefix[0])) {
    return appError(asPrefix[0]);
  }

  // 6) Tidak dikenal
  return appError("UNKNOWN");
}
