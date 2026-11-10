"use server";

/**
 * Server actions autentikasi — PRD bagian 19 (Alur Akun Lengkap), 20 (Kasus
 * Tepi dan Pesan Error), 21 (Aturan Validasi Input), 24 (Kontrak Akses Data).
 *
 * Kontrak umum:
 * - Semua aksi memakai klien server Supabase dengan sesi pengguna (RLS aktif)
 *   dari lib/supabase/server.ts. Env dibaca lazy sehingga `next build` tetap
 *   jalan tanpa kredensial asli.
 * - Validasi dua kali: di sini (pesan cepat, PRD 21) dan di database /
 *   trigger `handle_new_user` (penjaga terakhir, PRD 16.2).
 * - Hasil gagal selalu { ok: false, code, message } dengan pesan ramah
 *   bahasa Indonesia (PRD 20 + kode alur auth di lib/errors.ts).
 * - Setiap export dari file "use server" adalah server action.
 *
 * Nama field FormData yang dibaca (kontrak untuk FRONTEND-AGENT):
 *   register()             : email, username, password, invite_code (opsional)
 *   login()                : email, password
 *   requestPasswordReset() : email
 *   updatePassword()       : password, confirm_password (opsional)
 */

import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  appError,
  ERROR_MESSAGES,
  extractErrorCode,
  type ErrorCode,
} from "@/lib/errors";

// ============================================================
// Tipe hasil (kontrak untuk UI)
// ============================================================

export type UserRole = "member" | "moderator" | "admin";
export type UserStatus = "active" | "suspended" | "banned";

/** Ringkasan user + profil untuk halaman server dan hasil login. */
export interface SessionProfile {
  id: string;
  email: string | null;
  username: string;
  role: UserRole;
  status: UserStatus;
  /** ISO timestamp; terisi saat status "suspended" (PRD 18.1.7). */
  suspendedUntil: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /**
   * ISO timestamp pembuatan akun (profiles.created_at) — dipakai gate foto
   * akun < 24 jam (PRD 4.7 / 18.3.10). null bila profil gagal dibaca.
   */
  createdAt: string | null;
}

/** Bentuk gagal yang konsisten untuk semua aksi auth. */
export interface AuthErrorResult {
  ok: false;
  code: ErrorCode;
  message: string;
}

export interface RegisterResultOk {
  ok: true;
  /** true → tampilkan halaman "Cek emailmu" (PRD 19); false → langsung login. */
  needsEmailConfirmation: boolean;
}
export type RegisterResult = RegisterResultOk | AuthErrorResult;

export interface LoginResultOk {
  ok: true;
  user: SessionProfile;
}
export type LoginResult = LoginResultOk | AuthErrorResult;

export interface RequestPasswordResetResultOk {
  ok: true;
  /** Pesan netral — tidak membocorkan apakah email terdaftar (PRD 19). */
  message: string;
}
export type RequestPasswordResetResult =
  | RequestPasswordResetResultOk
  | AuthErrorResult;

export interface UpdatePasswordResultOk {
  ok: true;
}
export type UpdatePasswordResult = UpdatePasswordResultOk | AuthErrorResult;

// ============================================================
// Konstanta internal
// ============================================================

/** Persis CHECK constraint kolom profiles.username (PRD 8 / 21). */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
/** Validasi bentuk email yang cukup untuk pesan cepat (validasi final di auth). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Panjang password minimum (PRD 21). */
const PASSWORD_MIN = 8;

/**
 * Path halaman "buat password baru" (PRD 19). Tautan reset dikirim dengan
 * redirectTo = NEXT_PUBLIC_SITE_URL + path ini; halamannya adalah
 * app/(auth)/reset/confirm yang memanggil updatePassword().
 */
const RESET_PASSWORD_PATH = "/reset/confirm";

/** Pesan netral reset password — tidak membocorkan keberadaan email (PRD 19). */
const PASSWORD_RESET_SENT_MESSAGE =
  "Jika email terdaftar, tautan untuk membuat password baru sudah dikirim. Cek kotak masuk dan folder spam.";

const ROLES: readonly UserRole[] = ["member", "moderator", "admin"];
const STATUSES: readonly UserStatus[] = ["active", "suspended", "banned"];

// ============================================================
// Aksi: daftar (PRD 24 baris signUp, PRD 16.2, PRD 19 "Daftar")
// ============================================================

export async function register(formData: FormData): Promise<RegisterResult> {
  const email = readField(formData, "email").trim();
  const password = readField(formData, "password");
  const username = readField(formData, "username").trim();
  // Form mengirim field "undangan"; kontrak aksi menyebut "invite_code" —
  // terima keduanya agar tidak ada lagi mismatch nama field.
  const inviteRaw = readField(formData, "invite_code") || readField(formData, "undangan");
  // Trigger menormalkan upper(trim(...)) — samakan di sini agar konsisten.
  const inviteCode = (inviteRaw ?? "").trim().toUpperCase();

  // Validasi cepat di app (PRD 21); database memvalidasi ulang di trigger.
  if (!EMAIL_PATTERN.test(email)) {
    return toFailure(appError("EMAIL_INVALID"));
  }
  if (!USERNAME_PATTERN.test(username)) {
    return toFailure(appError("USERNAME_INVALID"));
  }
  if (password.length < PASSWORD_MIN) {
    return toFailure(appError("PASSWORD_WEAK"));
  }

  const supabase = await createClient();

  // Pra-periksa terpusat (0006 check_register_allowed): beri kode error
  // SPESIFIK sebelum signUp — GoTrue bisa menyamarkan penolakan trigger
  // menjadi pesan generik. Bila pra-periksa gagal jalan, lanjut signUp;
  // trigger DB tetap penjaga akhir.
  const { data: preCode, error: preError } = await supabase.rpc(
    "check_register_allowed",
    { p_username: username, p_code: inviteCode },
  );
  if (!preError && typeof preCode === "string" && preCode) {
    if (preCode === "USERNAME_INVALID") {
      return toFailure(appError("USERNAME_INVALID"));
    }
    if (preCode === "USERNAME_TAKEN") {
      return toFailure(appError("USERNAME_TAKEN"));
    }
    if (preCode === "INVITE_INVALID") {
      return toFailure(appError("INVITE_INVALID"));
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Pengejaan PERSIS dibaca trigger handle_new_user (PRD 16.2):
      // raw_user_meta_data->>'username' dan ->>'invite_code'.
      data: { username, invite_code: inviteCode },
    },
  });

  if (error) {
    return toFailure(mapAuthError(error));
  }

  // Bila verifikasi email aktif → session null → tampilkan "Cek emailmu".
  // Bila tidak aktif → sesi langsung terbentuk (cookie ter-set otomatis).
  return { ok: true, needsEmailConfirmation: data.session === null };
}

// ============================================================
// Aksi: login (PRD 19 "Login", PRD 18.1.4-7)
// ============================================================

export async function login(formData: FormData): Promise<LoginResult> {
  const email = readField(formData, "email").trim();
  const password = readField(formData, "password");

  if (!EMAIL_PATTERN.test(email)) {
    return toFailure(appError("EMAIL_INVALID"));
  }
  if (!password) {
    // Jangan bocorkan detail mana yang salah (PRD 19: rate limit ditangani Supabase).
    return toFailure(appError("LOGIN_INVALID"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return toFailure(mapAuthError(error));
  }

  // Cek status profil sebelum menyerahkan sesi (PRD 18.1.6-7).
  // Suspend yang sudah kedaluwarsa dianggap aktif — konsisten dengan
  // is_active_user() di DB (audit pasca-rilis 2026-11-11); tanpa ini,
  // akun terkunci sampai moderator me-restore manual.
  const profile = await fetchProfileRow(supabase, data.user.id);
  if (profile?.status === "banned") {
    await signOutQuietly(supabase);
    return toFailure(appError("ACCOUNT_BANNED"));
  }
  const suspendMasihBerlaku =
    profile?.status === "suspended" &&
    (!profile.suspended_until ||
      new Date(profile.suspended_until).getTime() > Date.now());
  if (suspendMasihBerlaku) {
    await signOutQuietly(supabase);
    return toFailure({
      code: "ACCOUNT_SUSPENDED",
      message: suspendedMessage(profile.suspended_until),
    });
  }

  return { ok: true, user: toSessionProfile(data.user, profile) };
}

// ============================================================
// Aksi: logout (PRD 18.1.8)
// ============================================================

/** Menghapus sesi lalu mengarahkan ke halaman utama. Selalu redirect. */
export async function logout(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // Sesi sudah tidak valid — tetap arahkan ke halaman utama.
  }
  redirect("/");
}

// ============================================================
// Aksi: lupa password (PRD 19 "Lupa password")
// ============================================================

export async function requestPasswordReset(
  formData: FormData,
): Promise<RequestPasswordResetResult> {
  const email = readField(formData, "email").trim();
  if (!EMAIL_PATTERN.test(email)) {
    return toFailure(appError("EMAIL_INVALID"));
  }

  const supabase = await createClient();
  const siteUrl = getSiteUrl();

  // Env dibaca lazy; bila NEXT_PUBLIC_SITE_URL belum diisi, kirim tanpa
  // redirectTo (Supabase memakai template bawaan) agar aksi tetap jalan.
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    siteUrl ? { redirectTo: siteUrl + RESET_PASSWORD_PATH } : undefined,
  );

  if (error) {
    return toFailure(mapAuthError(error));
  }

  // GoTrue selalu sukses untuk email apa pun → pesan netral (PRD 19).
  return { ok: true, message: PASSWORD_RESET_SENT_MESSAGE };
}

// ============================================================
// Aksi: buat password baru (halaman konfirmasi reset + /settings, PRD 19)
// ============================================================

export async function updatePassword(
  formData: FormData,
): Promise<UpdatePasswordResult> {
  const password = readField(formData, "password");
  // confirm_password opsional: null berarti field tidak dikirim sama sekali.
  const confirmPassword = readOptionalField(formData, "confirm_password");

  if (password.length < PASSWORD_MIN) {
    return toFailure(appError("PASSWORD_WEAK"));
  }
  if (confirmPassword !== null && confirmPassword !== password) {
    return toFailure(appError("PASSWORD_MISMATCH"));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // Halaman reset mengharuskan sesi recovery aktif (tautan reset sudah
    // ditukar menjadi sesi oleh klien browser di halaman tersebut).
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        "Sesi tidak ditemukan. Minta tautan lupa password yang baru, lalu coba lagi.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return toFailure(mapAuthError(error));
  }
  return { ok: true };
}

// ============================================================
// Helper: user + profil untuk halaman server (PRD 8 tabel profiles)
// ============================================================

/**
 * Ambil user sesi + baris profilnya. Dipakai halaman server/layout untuk
 * banner status (suspended/banned, PRD 18.1.6-7), info profil, dan gate
 * foto akun < 24 jam lewat createdAt (PRD 4.7 / 18.3.10 — dipakai
 * getImageUploadGate di lib/actions/images.ts).
 * Bila tidak login, atau profil belum terbaca, status dianggap aman.
 * Tidak pernah melempar error — selalu SessionProfile | null.
 */
export async function getSessionUser(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return null;
  }
  const profile = await fetchProfileRow(supabase, user.id);
  return toSessionProfile(user, profile);
}

// ============================================================
// Helper internal (tidak diekspor)
// ============================================================

interface ProfileRow {
  username: string | null;
  role: string | null;
  status: string | null;
  suspended_until: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
}

/** Baca satu kolom FormData sebagai string ("" bila bukan string/kosong). */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Baca kolom opsional; null berarti field tidak dikirim. */
function readOptionalField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function toFailure(error: AppErrorLike): AuthErrorResult {
  return { ok: false, code: error.code, message: error.message };
}

interface AppErrorLike {
  code: ErrorCode;
  message: string;
}

/** URL dasar aplikasi dari env, tanpa garis miring di akhir. */
function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
}

/**
 * Ambil baris profil dari tabel `profiles` (PRD 8). Gagal dibaca (RLS /
 * jaringan) diperlakukan sebagai profil hilang — pemanggil memakai default
 * aman (member/active) supaya halaman tetap tampil.
 */
async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("username, role, status, suspended_until, avatar_url, bio, created_at")
      .eq("id", userId)
      .maybeSingle();
    return normalizeExpiredSuspension((data as ProfileRow | null) ?? null);
  } catch {
    return null;
  }
}

/**
 * Suspend yang masa hukumannya sudah lewat diperlakukan sebagai aktif —
 * selaras dengan public.is_active_user() di database. Tanpa ini akun tetap
 * terkunci sampai moderator menjalankan "restore" manual, karena tidak ada
 * job yang mengembalikan status ke "active".
 */
function normalizeExpiredSuspension(row: ProfileRow | null): ProfileRow | null {
  if (!row || row.status !== "suspended" || !row.suspended_until) {
    return row;
  }
  const until = new Date(row.suspended_until).getTime();
  if (Number.isFinite(until) && until < Date.now()) {
    return { ...row, status: "active", suspended_until: null };
  }
  return row;
}

function normalizeRole(value: string | null): UserRole {
  return ROLES.includes(value as UserRole) ? (value as UserRole) : "member";
}

function normalizeStatus(value: string | null): UserStatus {
  return STATUSES.includes(value as UserStatus)
    ? (value as UserStatus)
    : "active";
}

function readMetaUsername(user: User): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const username = meta?.username;
  return typeof username === "string" && username ? username : null;
}

function toSessionProfile(
  user: User,
  profile: ProfileRow | null,
): SessionProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    username: profile?.username ?? readMetaUsername(user) ?? "",
    role: normalizeRole(profile?.role ?? null),
    status: normalizeStatus(profile?.status ?? null),
    suspendedUntil: profile?.suspended_until ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    bio: profile?.bio ?? null,
    createdAt: profile?.created_at ?? null,
  };
}

/** Sampaikan tanggal berakhirnya suspend dalam pesan (PRD 18.1.7). */
function suspendedMessage(suspendedUntil: string | null): string {
  const tanggal = formatTanggal(suspendedUntil);
  return tanggal
    ? `Akunmu disuspend sampai ${tanggal}. Tunggu sampai masa sanksi berakhir untuk login.`
    : ERROR_MESSAGES.ACCOUNT_SUSPENDED;
}

function formatTanggal(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return date.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date.toISOString();
  }
}

async function signOutQuietly(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Gagal sign-out tidak mengubah hasil yang dikembalikan ke UI.
  }
}

/**
 * Petakan error dari supabase-js auth menjadi { code, message } ramah.
 * Urutan: extractErrorCode dulu (menangkap kode trigger DB seperti
 * INVITE_INVALID/USERNAME_INVALID yang lolos lewat message signup, RLS,
 * dan jaringan), lalu pola khas error auth GoTrue (kode snake_case).
 */
function mapAuthError(error: unknown): AppErrorLike {
  const mapped = extractErrorCode(error);
  if (mapped.code !== "UNKNOWN") {
    return mapped;
  }

  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  const haystack = `${code} ${message}`.toLowerCase();

  // Email sudah terdaftar (kontrak signUp, PRD 24: "email sudah terdaftar").
  if (
    /user_already_exists|email_exists|already.?registered|already.?in.?use/.test(
      haystack,
    )
  ) {
    return appError("EMAIL_TAKEN");
  }
  // Login sebelum verifikasi email (PRD 18.1.4 — lihat catatan di handoff).
  if (/email.?not.?confirmed/.test(haystack)) {
    return appError("EMAIL_NOT_CONFIRMED");
  }
  // Kredensial salah; rate limit 5x gagal ditangani Supabase (PRD 19).
  if (/invalid.?login|invalid.?credentials/.test(haystack)) {
    return appError("LOGIN_INVALID");
  }
  if (/over_request_rate_limit|rate.?limit/.test(haystack)) {
    return appError("RATE_LIMIT");
  }
  if (/weak.?password|password.?should.?be|at least \d+ characters/.test(haystack)) {
    return appError("PASSWORD_WEAK");
  }
  if (/same.?password/.test(haystack)) {
    return appError("PASSWORD_SAME");
  }
  if (/banned/.test(haystack)) {
    return appError("ACCOUNT_BANNED");
  }
  // Username duplikat lolos sebagai unique violation generik (23505) —
  // risiko terbuka dari DB-AGENT: tidak ada kode khusus di trigger.
  if (
    (code === "23505" || haystack.includes("duplicate key")) &&
    haystack.includes("username")
  ) {
    return appError("USERNAME_TAKEN");
  }
  // Penolakan trigger pendaftaran yang disamarkan GoTrue ("Database error
  // saving new user"). Pra-periksa 0006 biasanya mencegat lebih dulu; ini
  // jaring pengaman dengan pesan yang menjelaskan, bukan "kesalahan" kosong.
  if (/error saving new user|database error when signing up/.test(haystack)) {
    return appError("REGISTRATION_REJECTED");
  }

  return mapped;
}
