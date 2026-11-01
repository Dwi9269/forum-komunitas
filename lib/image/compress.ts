/**
 * Kompres foto di sisi klien SEBELUM upload — PRD 4.7, 9, 25.2, 25.6.
 *
 * Hanya boleh dipakai dari komponen klien (browser): memakai canvas,
 * Web Worker, dan dependensi `browser-image-compression`. Bila modul ini
 * diimpor kode server, ia tetap lolos build (tidak ada efek samping saat
 * import), tetapi pemanggilan compressImage di server melempar error jelas.
 *
 * Ringkasan alur (PRD 4.7 / 9):
 *  1. Validasi tipe & ukuran mentah (maks 10 MB).
 *  2. Resize sisi terpanjang, konversi ke WebP kualitas +-0,8 (fallback
 *     JPEG bila browser tidak bisa meng-encode WebP).
 *  3. EXIF dibuang (termasuk lokasi GPS) demi privasi — opsi
 *     `preserveExif: false` dari library.
 *  4. Batas keras ukuran hasil diperiksa (1 MB foto post, 512 KB avatar).
 *
 * Error dilempar sebagai `Error` dengan properti `code` berkode FOTO_*
 * sehingga `extractErrorCode` (lib/errors.ts) mengenalinya begitu kode
 * tersebut didaftarkan di sana; message error sudah berupa pesan ramah
 * bahasa Indonesia sehingga bisa ditampilkan langsung.
 */

import imageCompression from "browser-image-compression";

/** Ukuran file mentah maksimal 10 MB sebelum kompres (PRD 4.7 / 9). */
export const MAX_RAW_BYTES = 10 * 1024 * 1024;
/** Batas keras hasil kompres foto post: 1 MB per file (PRD 9, jaga-jaga). */
export const MAX_FINAL_BYTES = 1024 * 1024;
/** Batas hasil kompres avatar: 512 KB. */
export const AVATAR_MAX_BYTES = 512 * 1024;

/**
 * Tipe MIME yang diterima SEBELUM kompres. HEIC/HEIF (foto iPhone) diterima
 * karena browser yang mendukung langsung mengonversinya saat kompres
 * (PRD 20 kasus tepi 7); bila browser tidak bisa membacanya, kompres gagal
 * dan pengguna diminta memilih foto JPG (PRD 25.6.1). GIF tidak didukung di
 * MVP. Hasil akhir yang diupload SELALU WebP/JPEG sesuai daftar MIME PRD 9.
 */
export const FOTO_TIPE_DIIZINKAN = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Kode error alur foto. Didaftarkan juga di lib/errors.ts (lihat handoff). */
export type FotoErrorCode =
  | "FOTO_INVALID_TYPE" // tipe file tidak didukung / tidak bisa dibaca browser
  | "FOTO_TOO_LARGE" // file mentah > 10 MB
  | "FOTO_STILL_LARGE" // hasil kompres masih di atas batas (1 MB / 512 KB)
  | "FOTO_LIMIT"; // jumlah foto melebihi batas (dipakai UI, maks 4)

/** Pesan ramah untuk tiap kode (gaya tabel PRD 20). */
export const FOTO_ERROR_MESSAGES: Record<FotoErrorCode, string> = {
  FOTO_INVALID_TYPE:
    "Format foto tidak didukung. Gunakan foto berformat JPG, PNG, atau WebP.",
  FOTO_TOO_LARGE: "Ukuran foto maksimal 10 MB. Pilih foto yang lebih kecil.",
  FOTO_STILL_LARGE:
    "Foto gagal dikompres di bawah batas ukuran. Coba pilih foto lain.",
  FOTO_LIMIT: "Maksimal 4 foto.",
};

/** Error alur foto: `Error` biasa plus properti `code` agar dikenali UI. */
export type FotoError = Error & { code: FotoErrorCode | (string & {}) };

/**
 * Buat error berkode. `message` boleh dikosongkan untuk memakai pesan ramah
 * bawaan dari FOTO_ERROR_MESSAGES (jangan sertakan detail teknis, PRD 20).
 */
export function fotoError(code: string, message?: string): FotoError {
  const error = new Error(
    message ??
      FOTO_ERROR_MESSAGES[code as FotoErrorCode] ??
      "Foto tidak bisa diproses. Coba lagi.",
  ) as FotoError;
  error.code = code;
  return error;
}

/** Type guard: apakah ini error alur foto (berkode FOTO_*)? */
export function isFotoError(error: unknown): error is FotoError {
  return (
    error instanceof Error &&
    typeof (error as unknown as { code?: unknown }).code === "string" &&
    (error as unknown as { code: string }).code.startsWith("FOTO_")
  );
}

/**
 * Validasi awal satu file foto SEBELUM kompres (PRD 4.7: maks 10 MB; PRD 9:
 * tipe diizinkan). Melempar FOTO_INVALID_TYPE / FOTO_TOO_LARGE. Dipakai
 * compressImage dan ImagePicker (penolakan cepat tanpa menyentuh library).
 */
export function validateImageFile(file: File): void {
  // Sebagian browser memberi type kosong untuk HEIC — tebak dari ekstensi.
  const tipe = file.type || tipeDariNama(file.name);
  if (!FOTO_TIPE_DIIZINKAN.includes(tipe as (typeof FOTO_TIPE_DIIZINKAN)[number])) {
    throw fotoError("FOTO_INVALID_TYPE");
  }
  if (file.size > MAX_RAW_BYTES) {
    throw fotoError("FOTO_TOO_LARGE");
  }
}

/** Tebak MIME dari ekstensi nama file (fallback bila file.type kosong). */
function tipeDariNama(nama: string): string {
  const ekstensi = nama.split(".").pop()?.toLowerCase() ?? "";
  const peta: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return peta[ekstensi] ?? "";
}

/** Opsi kompres. Nilai bawaan mengikuti keputusan Fase 4 (lihat handoff). */
export interface CompressOptions {
  /** Sisi terpanjang maksimal hasil, dalam piksel. Default 2048. */
  maxWidthOrHeight?: number;
  /** Target ukuran hasil, dalam MB. Default 0,4 (200-400 KB, PRD 25.6.4). */
  maxSizeMB?: number;
  /** Batas keras ukuran hasil, dalam byte. Default 1 MB (FOTO_STILL_LARGE). */
  maxFinalBytes?: number;
}

let webpBisaEncode: boolean | null = null;

/**
 * Deteksi (dan simpan) dukungan encode WebP canvas — beberapa browser lama
 * (mis. Safari sebelum 14) tidak bisa, sehingga hasil difallback ke JPEG.
 */
function canEncodeWebp(): boolean {
  if (webpBisaEncode !== null) {
    return webpBisaEncode;
  }
  if (typeof document === "undefined") {
    webpBisaEncode = false;
    return webpBisaEncode;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpBisaEncode = canvas
      .toDataURL("image/webp")
      .startsWith("data:image/webp");
  } catch {
    webpBisaEncode = false;
  }
  return webpBisaEncode;
}

/** Ekstensi file untuk MIME hasil kompres (selalu webp atau jpg). */
export function ekstensiDariTipe(tipe: string): "webp" | "jpg" {
  return tipe === "image/webp" ? "webp" : "jpg";
}

/**
 * Kompres satu foto (PRD 25.2): validasi awal, resize sisi terpanjang
 * (default 2048 px), konversi WebP kualitas 0,8 dengan target +-400 KB
 * (fallback JPEG bila WebP tidak didukung), buang EXIF, lalu periksa batas
 * keras ukuran hasil (default 1 MB).
 *
 * Mengembalikan `File` baru bernama `<nama-asli>.webp`/`.jpg` siap diupload.
 * Melempar error berkode FOTO_INVALID_TYPE / FOTO_TOO_LARGE /
 * FOTO_STILL_LARGE dengan pesan ramah Indonesia.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("Kompres foto hanya bisa dijalankan di browser.");
  }
  validateImageFile(file);

  const maxWidthOrHeight = options.maxWidthOrHeight ?? 2048;
  const maxSizeMB = options.maxSizeMB ?? 0.4;
  const maxFinalBytes = options.maxFinalBytes ?? MAX_FINAL_BYTES;

  let hasil: Blob;
  try {
    hasil = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: canEncodeWebp() ? "image/webp" : "image/jpeg",
      initialQuality: 0.8,
      preserveExif: false, // buang metadata termasuk GPS (PRD 4.7)
    });
  } catch {
    // Umumnya gagal dekode (mis. HEIC di browser yang tidak mendukung,
    // PRD 20 kasus tepi 7) — pesan tidak membocorkan detail teknis.
    throw fotoError(
      "FOTO_INVALID_TYPE",
      "Browser tidak bisa membaca foto ini. Coba pilih foto berformat JPG.",
    );
  }

  if (hasil.size > maxFinalBytes) {
    throw fotoError("FOTO_STILL_LARGE");
  }

  const ext = ekstensiDariTipe(hasil.type);
  const namaDasar = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([hasil], `${namaDasar}.${ext}`, {
    type: hasil.type,
    lastModified: Date.now(),
  });
}
