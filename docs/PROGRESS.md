# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [x] Fase 1: Fondasi — **Gerbang 1 LULUS** (migrasi live + uji RLS 17/17)
- [x] Fase 2: Akun — kode selesai; alur siap diuji user di localhost
- [x] Fase 3: Inti forum — kode selesai; alur siap diuji user di localhost
- [ ] Fase 4: Foto dan moderasi — berikutnya (butuh: view statistik komunitas, aksi lapor/admin, upload foto)
- [ ] Fase 5: Audit independen (QA)
- [ ] Fase 6: Rilis (DevOps) — target user: hosting di domain chatasiquqe (my.id/web.id/biz.id) via Vercel

## Status infrastruktur

- Supabase live: `irmmdnipacvrcoospjcp` (region ap-northeast-2/Seoul, tier gratis). 4 migrasi diterapkan (tracked di `private.app_migrations`). Uji RLS **17 OK / 0 GAGAL**.
- Kredensial lengkap di `.env.local` (tidak di-commit): URL, publishable key, secret key, CRON_SECRET terisi; `NEXT_PUBLIC_SITE_URL` masih localhost (ganti saat deploy).
- 5 komunitas awal ter-seed: umum, curhat, jual-beli, teknologi, hobi. Pendaftar pertama otomatis admin tanpa kode undangan.

## Perbaikan integrasi oleh ORCHESTRATOR

1. Kontrak antar agent Fase 3: `content`→`body` (CommentForm, SubmitPostForm), `setVote({...})`→`setVotePost(id, value)`, `getCommunity`→`getCommunityBySlug`.
2. Harness uji RLS: SETUP dibungkus `BEGIN..COMMIT` eksplisit (satu query string = satu transaksi implisit; ROLLBACK skenario pertama ikut membatalkan SETUP — gejala palsu S6/S8) + promosi `rls_mod` jadi moderator. Database sendiri sehat.

## Hambatan terbuka

- Node 18 → warning deprecation @supabase/supabase-js; upgrade ke 20+ disarankan sebelum rilis.
- Domain hosting: rekomendasi chatasiquqe.my.id (OPEN_QUESTIONS no. 8). Perlu akun Vercel (+ repo GitHub atau deploy CLI).
- SMTP bawaan Supabase terbatas — sambungkan SMTP (PRD 23.3) sebelum mengundang pengguna banyak.

## Catatan sesi

- 2026-11-01: Fase 1-3 dikode (5 gelombang agent paralel, build lulus). Gerbang 1 selesai penuh: migrasi live + 17/17 uji RLS. Handoff semua fase di HANDOFF.md. Dev server berjalan di background (jangan jalankan `next build` dan `next dev` bersamaan — konflik `.next`). Migrasi/uji ulang: `set "SUPA_DB_PASSWORD=..." && node scripts/run-migrations.mjs --tests`.
