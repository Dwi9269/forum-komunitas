import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Middleware sesi Supabase (PRD 23.1).
 *
 * Hanya menyegarkan sesi: cookie auth yang diputar Supabase ditulis ulang
 * ke request dan respons agar Server Component membaca sesi terkini.
 * Redirect pelindung rute (mis. /admin) ditambahkan di fase berikutnya —
 * di sini sengaja tidak ada redirect paksa.
 */
export async function middleware(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  // Jalankan middleware di semua path KECUALI file statis:
  // _next/static, _next/image, favicon, gambar, font, dan aset publik lain.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
