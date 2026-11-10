# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [x] Fase 1: Fondasi — Gerbang 1 LULUS (migrasi live + uji RLS 17/17)
- [x] Fase 2: Akun — selesai
- [x] Fase 3: Inti forum — selesai
- [x] Fase 4: Foto dan moderasi — selesai (migrasi 0005 live)
- [x] Fase 5: Audit QA — Gerbang 5 LULUS (0 temuan Tinggi; uji manual eksplorasi penuh 2026-11-02 lulus)
- [x] Fase 6: Rilis — **DEPLOYED** 🎉 https://www.chatasiqque.my.id (plus alias chatasiqque.my.id dan forum-komunitas-three.vercel.app)

## Status produksi (2026-11-02)

- **URL live**: https://www.chatasiqque.my.id — HTTPS aktif (Vercel), apex mengarah Vercel (A 76.76.21.21), www via CNAME.
- GitHub: https://github.com/Dwi9269/forum-komunitas (branch main, auto-deploy dari Vercel).
- Supabase live: `irmmdnipacvrcoospjcp` (ap-northeast-2). Migrasi 0001-0006 diterapkan. Uji RLS 17/17.
- Login admin (dwijr926@gmail.com) & Ranum112 (dwijr922@gmail.com) terverifikasi di production; sandi kedua akun diganti via fitur ganti sandi.
- Eksplorasi penuh production: feed, komunitas, detail+vote+komentar+balas, submit, lapor, admin (tolak laporan, suspend/reaktivasi, log), settings bio+ganti sandi, profil, aturan — semua lulus.

## Sisa pekerjaan (opsional / lanjutan)

- ~~Pencarian (PRD Pasca-MVP 15)~~ — **SELESAI 2026-11-11**: kotak cari di beranda (form GET), getFeed({ search }) + pagination konsisten, terverifikasi production.
- Notifikasi + DM, peran moderator per komunitas, moderasi gambar otomatis, PWA+push, video (butuh R2/Pro dulu).
- Halaman legal `terms` & `privacy` (PRD 28) — `rules` sudah ada.
- Cron `/api/cron/cleanup` (PRD 23.4) + vercel.json cron.
- Temuan QA Rendah R-6/7/8/9/11/12 (tidak memblokir).
- Node lokal v18 → warning deprecation; Vercel memakai Node 20+ otomatis (tidak berdampak produksi).

## Hambatan terbuka

- (tertutup) Domain live 2026-11-02. Catatan ejaan: domain resmi **chatasiqque** — DUA huruf q.

## Catatan sesi

- 2026-11-01: Fase 1-5 selesai dalam satu sesi (8 gelombang agent; batas konkurensi 3 agent paralel). Handoff semua fase di HANDOFF.md; audit di QA_REPORT.md. Dev server berjalan di background (jangan jalankan `next build` dan `next dev` bersamaan). Migrasi/uji ulang: `set "SUPA_DB_PASSWORD=..." && node scripts/run-migrations.mjs --tests`.
