import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Klien Supabase untuk Server Component, Server Action, dan Route Handler.
 *
 * - Next 15: `cookies()` bersifat async, jadi fungsi ini async —
 *   selalu panggil dengan `await createClient()`.
 * - Memakai kunci anon + sesi pengguna sehingga RLS aktif (PRD bagian 24).
 * - Env dibaca DI DALAM fungsi (lazy), bukan saat import, agar
 *   `next build` tetap jalan walau .env.local masih placeholder.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Kredensial Supabase belum diisi: set NEXT_PUBLIC_SUPABASE_URL dan " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local (lihat PRD bagian 23.2).",
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Dipanggil dari Server Component yang tidak boleh men-set cookie.
          // Aman diabaikan selama middleware updateSession aktif menyegarkan
          // sesi (pola resmi @supabase/ssr).
        }
      },
    },
  });
}
