import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export interface UpdateSessionResult {
  /** Respons yang HARUS dikembalikan middleware (cookie sesi sudah disegarkan). */
  response: NextResponse;
  /** Pengguna sesuai sesi terkini; null bila tamu / sesi tidak valid. */
  user: User | null;
}

/**
 * Pola updateSession @supabase/ssr: menyegarkan cookie sesi Supabase di
 * middleware. Dipanggil dari middleware.ts di root repo.
 *
 * Env dibaca DI DALAM fungsi (lazy) dan helper tidak pernah melempar,
 * agar build/dev tetap aman walau .env.local masih placeholder.
 */
export async function updateSession(
  request: NextRequest,
): Promise<UpdateSessionResult> {
  // Mulai dari respons "next" agar cookie yang diputar Supabase bisa
  // ditempel ke respons akhir.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Env belum lengkap (placeholder dihapus / belum diisi): lewati sesi,
  // jangan pernah throw di middleware.
  if (!url || !anonKey) {
    return { response, user: null };
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // PENTING: getUser() wajib dipanggil — inilah yang memicu refresh token
  // kedaluwarsa dan penulisan cookie baru. Jangan dihapus.
  let user: User | null = null;
  try {
    const {
      data: { user: fetched },
    } = await supabase.auth.getUser();
    user = fetched ?? null;
  } catch {
    // Jaringan bermasalah / env masih placeholder: perlakukan sebagai tamu.
    user = null;
  }

  return { response, user };
}
