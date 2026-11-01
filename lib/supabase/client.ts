import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

/**
 * Klien Supabase untuk komponen klien (browser) — PRD 23.1.
 *
 * - Singleton: satu tab memakai satu instance agar sesi konsisten.
 * - Env dibaca DI DALAM fungsi (lazy), bukan saat import, agar
 *   `next build` dan dev server tetap jalan walau .env.local masih
 *   berisi placeholder. Error hanya muncul saat fungsi benar-benar
 *   dipanggil tanpa env yang valid.
 */
export function createClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Kredensial Supabase belum diisi: set NEXT_PUBLIC_SUPABASE_URL dan " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local (lihat PRD bagian 23.2).",
    );
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
