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
