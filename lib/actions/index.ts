/**
 * lib/actions — akses data aplikasi (PRD bagian 24 "Kontrak Akses Data").
 *
 * Aksi data ditambahkan di Fase 2-3:
 *   auth.ts, posts.ts, comments.ts, votes.ts, reports.ts, admin.ts.
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
