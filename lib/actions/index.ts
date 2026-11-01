/**
 * lib/actions — akses data aplikasi (PRD bagian 24 "Kontrak Akses Data").
 *
 * Aksi data per fase:
 *   Fase 2: auth.ts
 *   Fase 3: communities.ts, posts.ts, comments.ts, votes.ts
 *           (comment-tree.ts & validate.ts = helper murni, bukan action)
 *   Berikutnya: reports.ts, admin.ts, media (post_images / getPostImages).
 *
 * Aturan yang berlaku untuk semua aksi:
 * - Memakai klien Supabase dengan sesi pengguna (RLS aktif) dari
 *   lib/supabase/server.ts. Kunci service role HANYA untuk cron.
 * - Validasi dua kali: di app (pesan cepat, PRD bagian 21) dan di database
 *   (penjaga terakhir).
 * - Error dikembalikan lewat extractErrorCode() dari lib/errors.ts,
 *   berbentuk { code, message }.
 */

export {};
