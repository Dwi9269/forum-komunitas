/**
 * Pembungkus pemanggilan aksi data untuk halaman admin (Server Component) —
 * Fase 4 (MOD). Pola sama dengan components/feed/server-data.ts (milik
 * FRONTEND-AGENT — tidak boleh diubah, jadi dibuat salinan kecil milik MOD).
 *
 * Aturan (PRD 24): komponen TIDAK memanggil Supabase langsung; semua akses
 * data lewat lib/actions. Karena kredensial Supabase mungkin belum ada dan
 * createClient() bisa melempar error, SETIAP pemanggilan dibungkus try/catch
 * di sini sehingga halaman tetap render kerangkanya (state error tampil).
 */

import { extractErrorCode } from "@/lib/errors";

export type HasilAman<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string };

/** Lepas amplop ActionResult bila fungsi sudah mengembalikan { ok, data }. */
type AmbilData<T> =
  T extends { ok: true; data: infer D }
    ? D
    : T extends { ok: false }
      ? never
      : T;

/**
 * Jalankan fungsi async; error apa pun (env/RLS/jaringan) menjadi pesan ramah.
 * Aksi lib/actions umumnya SUDAH mengembalikan amplop { ok, data } — hasil itu
 * dibuka sekali di sini agar pemanggil selalu melihat data mentahnya; nilai
 * polos (bukan amplop) tetap dibungkus sebagai sukses.
 */
export async function aman<T>(
  jalankan: () => Promise<T>
): Promise<HasilAman<AmbilData<T>>> {
  try {
    const hasil = await jalankan();
    if (hasil !== null && typeof hasil === "object" && "ok" in hasil) {
      const amplop = hasil as { ok: boolean; message?: string; code?: string; data?: unknown };
      if (amplop.ok && "data" in amplop) {
        return { ok: true, data: amplop.data as AmbilData<T> };
      }
      if (!amplop.ok) {
        return {
          ok: false,
          message: amplop.message ?? "Terjadi kesalahan.",
          code: String(amplop.code ?? "UNKNOWN"),
        };
      }
    }
    return { ok: true, data: hasil as AmbilData<T> };
  } catch (error) {
    const dipetakan = extractErrorCode(error);
    return { ok: false, message: dipetakan.message, code: dipetakan.code };
  }
}
