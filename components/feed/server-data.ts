/**
 * Pembungkus pemanggilan aksi data untuk Server Component — Fase 3 (FRONTEND).
 *
 * Aturan (PRD 24): komponen TIDAK memanggil Supabase langsung; semua akses
 * data lewat lib/actions. Karena kredensial Supabase mungkin belum ada dan
 * createClient() melempar error, SETIAP pemanggilan dibungkus try/catch di
 * sini sehingga halaman tetap render kerangkanya (state error tampil).
 *
 * Catatan: `sort` sengaja disertakan pada argumen getFeed (nilai "new"|"hot",
 * sesuai RPC get_feed(p_sort)) meski kontrak tertulis belum menyebutnya —
 * backend bebas mengabaikan atau memetakannya ke p_sort.
 */

import { extractErrorCode } from "@/lib/errors";
import { getFeed, getPost } from "@/lib/actions/posts";
import { getCommunities, getCommunityBySlug } from "@/lib/actions/communities";
import { getSessionUser, type SessionProfile } from "@/lib/actions/auth";

export interface ArgumenFeed {
  cursor?: string;
  communitySlug?: string;
  username?: string;
  sort?: "new" | "hot";
  /** Hanya komunitas yang diikuti (PRD 18.2.1 — beranda pengguna login). */
  onlyJoined?: boolean;
}

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
 * polos (bukan amplop) tetap dibungkus sebagai sukses. Tanpa pembukaan ini,
 * pesan gagal aksi tidak pernah sampai ke UI dan normalizer salah baca bentuk.
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
          message: amplop.message ?? "Terjadi kesalahan. Coba lagi.",
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

export async function ambilFeed(args: ArgumenFeed = {}): Promise<HasilAman<unknown>> {
  return aman(() => getFeed(args));
}

export async function ambilDaftarKomunitas(): Promise<HasilAman<unknown>> {
  return aman(() => getCommunities());
}

export async function ambilKomunitas(slug: string): Promise<HasilAman<unknown>> {
  return aman(() => getCommunityBySlug(slug));
}

export async function ambilPost(id: string): Promise<HasilAman<unknown>> {
  return aman(() => getPost(id));
}

export async function ambilSesi(): Promise<HasilAman<SessionProfile | null>> {
  return aman<SessionProfile | null>(() => getSessionUser());
}
