"use server";

/**
 * Server action foto post — PRD bagian 4.3 (lampiran foto), 9 (Storage Foto),
 * 24 (baris getPostImages), 25 (kompres & upload).
 *
 * Pembagian kerja (Fase 4):
 * - MEDIA-AGENT mengunggah file dari browser langsung ke bucket `post-images`
 *   pada path `{user_id}/{uuid}.{ext}` (kompres + EXIF dibuang di klien,
 *   PRD 25.2-25.3) lalu menyerahkan DAFTAR PATH ke createPost.
 * - File ini membaca relasi `post_images` dan mengubah storage_path menjadi
 *   URL publik (bucket publik, getPublicUrl) — tidak ada upload di server.
 *
 * Siapa boleh membaca (dijaga RLS `pimg_select`, migrasi 0003):
 * - pemilik post dan moderator (baris tetap terbaca walau post hidden/deleted);
 * - pengguna lain hanya bila post masih terlihat di `posts_feed` (detail/feed).
 * Panggilan langsung ke post tersembunyi oleh orang lain menghasilkan array
 * kosong (RLS menyaring diam-diam), bukan error.
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

/** Baris mentah tabel post_images yang dibutuhkan. */
interface PostImageRow {
  post_id: string;
  storage_path: string;
  position: number;
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

// ============================================================
// Gate foto akun baru (PRD 4.7 / 18.3.10: akun < 24 jam belum boleh
// mengunggah foto — penegak akhir tetap can_upload() di DB, migrasi
// 0002/0003; fungsi ini hanya menonaktifkan tombol proaktif di UI).
// ============================================================

/** Umur minimum akun sebelum boleh mengunggah foto (jam — PRD 4.7). */
const UPLOAD_WAIT_MS = 24 * 60 * 60 * 1000;

/** Tidak diekspor: file "use server" hanya boleh mengekspor fungsi async. */
const PESAN_AKUN_BARU_24JAM =
  "Foto belum bisa diunggah: akun baru dapat mengunggah foto setelah berumur 24 jam. Kamu masih bisa mengirim post tanpa foto.";

export interface ImageUploadGate {
  /** true → pemilih foto boleh aktif. */
  allowed: boolean;
  /** Alasan ramah saat tidak dibolehkan; null bila tanpa alasan khusus. */
  reason: string | null;
}

/**
 * Cek proaktif boleh upload foto (PRD 18.3.10): dihitung server-side dari
 * umur akun (SessionProfile.createdAt) — TIDAK memanggil RPC can_upload
 * (tidak diekspos sebagai RPC). Keputusan konservatif:
 * - Bukan "active" (suspend/ban) → tidak dibolehkan tanpa alasan foto
 *   (form utama sudah dinonaktifkan halaman /submit dengan alasan status).
 * - createdAt tidak terbaca / tidak valid → dibolehkan (jangan mengunci
 *   pengguna karena kegagalan baca); DB tetap menolak saat upload sungguhan.
 */
export async function getImageUploadGate(): Promise<ImageUploadGate> {
  const user = await getSessionUser();
  if (!user) {
    return { allowed: false, reason: null };
  }
  if (user.status !== "active") {
    return { allowed: false, reason: null };
  }
  if (!user.createdAt) {
    return { allowed: true, reason: null };
  }
  const dibuat = new Date(user.createdAt).getTime();
  if (!Number.isFinite(dibuat) || Date.now() - dibuat >= UPLOAD_WAIT_MS) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: PESAN_AKUN_BARU_24JAM };
}

/**
 * Ambil URL publik semua foto satu post (PRD 24 getPostImages).
 *
 * Urutan mengikuti kolom `position` (PRD 24 secara eksplisit
 * `.order('position')`; tabel post_images tidak punya kolom created_at,
 * jadi urutan waktu tidak tersedia — lihat handoff Fase 4).
 */
export async function getPostImages(
  postId: string,
): Promise<ActionResult<{ images: string[] }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const id = postId?.trim() ?? "";
    if (!id) {
      return failure(appError("NOT_FOUND"));
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("post_images")
      .select("post_id, storage_path, position")
      .eq("post_id", id)
      .order("position", { ascending: true })
      .order("id", { ascending: true }); // tiebreak deterministik
    if (error) {
      return failure(extractErrorCode(error));
    }

    const rows = (data ?? []) as PostImageRow[];
    const bucket = supabase.storage.from("post-images");
    const images = rows.map(
      (row) => bucket.getPublicUrl(row.storage_path).data.publicUrl,
    );
    return { ok: true, data: { images } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
