/**
 * Service Worker — Forum Komunitas (Fase 6: PWA installable, TANPA push).
 * Vanilla JS, tanpa dependensi. Terdaftar oleh components/PwaRegister.tsx.
 *
 * Prinsip KEAMANAN (sangat penting — kesalahan di sini bisa merusak forum):
 * - HANYA menyentuh request GET + same-origin.
 * - JANGAN PERNAH meng-intercept/meng-cache:
 *     * supabase.co / domain lain (auth & data pengguna)   -> guard origin,
 *     * server actions (POST ke halaman)                    -> guard method,
 *     * /api/* (data harus selalu segar)                    -> guard pathname,
 *     * RSC prefetch (?_rsc) dan /_next/image               -> tidak masuk daftar.
 * - Navigasi dokumen: network-first; gagal jaringan -> /offline.html dari cache.
 *   Halaman TIDAK di-cache (semua rute force-dynamic & per-pengguna).
 * - Aset statis: **network-first** (fallback cache saat offline). Mengapa bukan
 *   cache-first? Chunk /_next/static di-cache-first akan menyajikan JavaScript
 *   LAMA selamanya ke pengguna lama saat ada deploy baru (kasus nyata: fitur
 *   realtime tidak pernah sampai ke tab yang sudah terbuka). Network-first
 *   memastikan deploy baru selalu sampai; offline tetap tersaji dari cache.
 */

const CACHE_NAME = "forum-komunitas-v2";
const PRECACHE_URLS = ["/", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: "reload" agar tidak menyalin respons HTTP cache browser.
      // allSettled: kegagalan satu URL tidak menggagalkan instalasi SW.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // Abaikan — /offline.html tetap dicoba, install tetap lanjut.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Guard 1 — HANYA GET. POST/PUT/PATCH/DELETE (server actions, mutasi data)
  // lewat apa adanya, tanpa diintercept.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Guard 2 — HANYA same-origin. supabase.co, CDN, dan domain lain
  // TIDAK disentuh sama sekali.
  if (url.origin !== self.location.origin) return;

  // Guard 3 — /api/* tidak pernah diintercept/di-cache (data harus segar).
  if (url.pathname.startsWith("/api/")) return;

  // Navigasi dokumen -> network-first, fallback /offline.html.
  if (request.mode === "navigate") {
    event.respondWith(navigasiNetworkFirst(request));
    return;
  }

  // Aset statis -> network-first (fallback cache saat offline). Lihat
  // komentar header: cache-first membuat deploy baru tidak pernah sampai
  // ke pengguna lama.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.svg"
  ) {
    event.respondWith(asetNetworkFirst(request));
    return;
  }

  // Sisanya (RSC prefetch ?_rsc=, /_next/image, /favicon.ico, dsb.)
  // -> TIDAK diintercept, biarkan jaringan normal.
});

async function navigasiNetworkFirst(request) {
  try {
    // Halaman sengaja TIDAK di-cache: semua rute force-dynamic & per-pengguna,
    // jadi tidak ada risiko menyajikan HTML/sesi basi ke pengguna lain.
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    return new Response("Kamu sedang offline. Periksa koneksi internetmu.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function asetNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    // Hanya cache respons same-origin ("basic") yang sukses.
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const tersimpan = await cache.match(request);
    if (tersimpan) return tersimpan;
    return new Response("", { status: 504, statusText: "Offline" });
  }
}
