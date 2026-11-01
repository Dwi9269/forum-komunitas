/**
 * Upload foto ke Supabase Storage dari komponen klien — PRD 9, 20, 25.3.
 *
 * HANYA boleh dipanggil dari browser (butuh sesi login lewat klien
 * lib/supabase/client.ts dan API storage supabase-js). Modul ini tetap
 * build-safe: env kredensial dibaca lazy di dalam createClient, jadi
 * `next build` tidak tersandung .env.local yang masih placeholder.
 *
 * Aturan arsitektur: komponen TIDAK mengakses database/storage langsung —
 * upload foto memang sengaja diletakkan di lib/image agar halaman /submit
 * dan /settings cukup memanggil fungsi di sini.
 *
 * Kontrak (keputusan Fase 4):
 * - uploadPostImage(file)  -> PATH storage "userId/uuid.webp|jpg" (BUKAN
 *   URL) — createPost milik BACKEND menerima path untuk tabel post_images.
 * - uploadAvatar(file)     -> URL publik avatar (disimpan ke
 *   profiles.avatar_url oleh pemanggil).
 * - deletePostImage(path)  -> rollback bila langkah berikutnya gagal; file
 *   yatim yang luput tetap dibersihkan job mingguan (PRD 20 kasus tepi 3).
 *
 * Semua error dilempar sebagai `Error` dengan properti `code` (FOTO_* atau
 * kode lib/errors.ts seperti LOGIN_REQUIRED / NETWORK / RLS_DENIED) dan
 * message ramah bahasa Indonesia tanpa detail teknis.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import {
  AVATAR_MAX_BYTES,
  compressImage,
  ekstensiDariTipe,
} from "./compress";

/** Bucket foto post (publik untuk baca) — PRD 9. */
export const BUCKET_POST_IMAGES = "post-images";
/** Bucket avatar — PRD 9. */
export const BUCKET_AVATARS = "avatars";

/**
 * Ambil klien browser + id pengguna sesi. Melempar LOGIN_REQUIRED bila
 * sesi tidak ada / kedaluwarsa (bisa dinormalisasi ulang oleh
 * extractErrorCode karena kode ini sudah terdaftar di lib/errors.ts).
 */
async function sesi(): Promise<{ supabase: SupabaseClient; userId: string }> {
  if (typeof window === "undefined") {
    throw new Error("Upload foto hanya bisa dilakukan dari browser.");
  }
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const e = new Error("Kamu harus login untuk melakukan aksi ini.") as
      Error & { code: string };
    e.code = "LOGIN_REQUIRED";
    throw e;
  }
  return { supabase, userId: data.user.id };
}

/**
 * Samakan bentuk error agar konsisten untuk UI: error alur foto (FOTO_*,
 * message sudah ramah) diteruskan apa adanya; error lain (storage, jaringan,
 * RLS) dipetakan lewat extractErrorCode ke kode + pesan ramah PRD 20 tanpa
 * membocorkan detail teknis.
 */
function jadiAppError(error: unknown): Error & { code: string } {
  const kode = (error as { code?: unknown } | null)?.code;
  if (
    error instanceof Error &&
    typeof kode === "string" &&
    kode.startsWith("FOTO_")
  ) {
    return error as Error & { code: string };
  }
  const app = extractErrorCode(error);
  const e = new Error(app.message) as Error & { code: string };
  e.code = app.code;
  return e;
}

/**
 * Kompres dan upload satu foto post ke bucket `post-images`
 * (PRD 9: path `{user_id}/{uuid}.webp`, tipe hasil selalu WebP/JPEG).
 *
 * Validasi tipe & ukuran mentah (maks 10 MB) terjadi di dalam compressImage.
 * Mengembalikan PATH storage — bukan URL — untuk dikirim ke createPost.
 */
export async function uploadPostImage(file: File): Promise<string> {
  try {
    const { supabase, userId } = await sesi();
    const terkompres = await compressImage(file);
    const path = `${userId}/${crypto.randomUUID()}.${ekstensiDariTipe(terkompres.type)}`;

    const { error } = await supabase.storage
      .from(BUCKET_POST_IMAGES)
      .upload(path, terkompres, {
        contentType: terkompres.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (error) throw error;

    return path;
  } catch (error) {
    throw jadiAppError(error);
  }
}

/**
 * Kompres dan upload avatar ke bucket `avatars`: sisi terpanjang 512 px,
 * batas keras 512 KB setelah kompres. Path `{user_id}/avatar-{waktu}.webp`
 * (berakhir .jpg bila browser tidak mendukung WebP) — nama unik per upload
 * agar URL avatar lama tetap valid sampai profil diperbarui.
 *
 * Mengembalikan URL publik untuk disimpan ke profiles.avatar_url.
 */
export async function uploadAvatar(file: File): Promise<string> {
  try {
    const { supabase, userId } = await sesi();
    const terkompres = await compressImage(file, {
      maxWidthOrHeight: 512,
      maxSizeMB: 0.4,
      maxFinalBytes: AVATAR_MAX_BYTES,
    });
    const path = `${userId}/avatar-${Date.now()}.${ekstensiDariTipe(terkompres.type)}`;

    const { error } = await supabase.storage
      .from(BUCKET_AVATARS)
      .upload(path, terkompres, {
        contentType: terkompres.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET_AVATARS).getPublicUrl(path);
    return data.publicUrl;
  } catch (error) {
    throw jadiAppError(error);
  }
}

/**
 * Hapus satu foto post yang sudah terunggah — dipakai pemanggil untuk
 * ROLLBACK bila langkah setelah upload gagal (mis. createPost menolak,
 * PRD 25.4). Contoh pola di pemanggil:
 *
 *   const paths: string[] = [];
 *   try {
 *     for (const f of files) paths.push(await uploadPostImage(f));
 *     const id = await createPost(...paths...);
 *   } catch (e) {
 *     await Promise.allSettled(paths.map((p) => deletePostImage(p)));
 *     throw e;
 *   }
 *
 * Kegagalan hapus tetap dilempar sebagai error ramah, tetapi pemanggil
 * sebaiknya menelan (allSettled / catch kosong) agar error asli yang
 * lebih penting tidak tertutup — sisa file yatim dibersihkan job mingguan
 * (PRD 20 kasus tepi 3, PRD 23).
 */
export async function deletePostImage(path: string): Promise<void> {
  try {
    const { supabase } = await sesi();
    const { error } = await supabase.storage
      .from(BUCKET_POST_IMAGES)
      .remove([path]);
    if (error) throw error;
  } catch (error) {
    throw jadiAppError(error);
  }
}
