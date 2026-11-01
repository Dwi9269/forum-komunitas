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
}

export type HasilAman<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string };

/** Jalankan fungsi async; error apa pun (env/RLS/jaringan) menjadi pesan ramah. */
async function aman<T>(jalankan: () => Promise<T>): Promise<HasilAman<T>> {
  try {
    return { ok: true, data: await jalankan() };
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
