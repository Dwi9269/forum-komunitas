# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [x] Fase 1: Fondasi — Gerbang 1 LULUS (migrasi live + uji RLS 17/17)
- [x] Fase 2: Akun — selesai
- [x] Fase 3: Inti forum — selesai
- [x] Fase 4: Foto dan moderasi — selesai (migrasi 0005 live)
- [x] Fase 5: Audit QA — **Gerbang 5 LULUS (bersyarat)**: 0 temuan Tinggi; semua temuan Sedang diperbaiki & lulus uji ulang; 6 temuan Rendah sengaja terbuka (tidak memblokir); syarat tersisa = uji manual M1-M12 oleh user (daftar di `docs/QA_REPORT.md`)
- [ ] Fase 6: Rilis (DevOps) — **berikutnya, dikerjakan bersama user**: deploy Vercel + domain chatasiquqe + SMTP + cron

## Status infrastruktur

- Supabase live: `irmmdnipacvrcoospjcp` (ap-northeast-2). Migrasi 0001-0005 diterapkan (tracked `private.app_migrations`). Uji RLS **17 OK / 0 GAGAL**.
- Kredensial lengkap di `.env.local` (tidak di-commit). `NEXT_PUBLIC_SITE_URL` masih localhost → ganti saat deploy.
- Build produksi: LULUS (17 rute: feed, komunitas, detail, submit, auth 4, admin 5, settings, profil, rules).

## Fitur yang ada (ringkas)

Akun: register kode undangan (akun pertama = admin), login, lupa password, banner suspend/ban. Forum: feed komunitas diikuti (tamu = CTA), komunitas + jumlah anggota, post (teks + maks 4 foto terkompresi <1 MB, anonim), komentar bertingkat + vote komentar, vote post optimis, menu lapor/hapus. Admin: antrean laporan (thumbnail diburamkan), kelola pengguna (suspend/blokir), kode undangan, komunitas, log. Profil /u/[username], /settings (bio+avatar), /rules.

## Hambatan terbuka

- Uji manual M1-M12 (QA_REPORT.md) — terutama M1 alur akun, M3 anonim tak terbongkar, M4 auto-hide 3 laporan, M8 foto dari HP.
- Deploy: perlu akun GitHub + Vercel dari user; DNS chatasiquqe.my.id; SMTP (PRD 23.3); `NEXT_PUBLIC_SITE_URL` + Redirect URLs Supabase saat domain aktif.
- Node 18 → warning deprecation; upgrade ke 20+ disarankan sebelum rilis.
- Temuan QA Rendah R-6/7/8/9/11/12 terbuka (tidak memblokir; detail di QA_REPORT.md).

## Catatan sesi

- 2026-11-01: Fase 1-5 selesai dalam satu sesi (8 gelombang agent; batas konkurensi 3 agent paralel). Handoff semua fase di HANDOFF.md; audit di QA_REPORT.md. Dev server berjalan di background (jangan jalankan `next build` dan `next dev` bersamaan). Migrasi/uji ulang: `set "SUPA_DB_PASSWORD=..." && node scripts/run-migrations.mjs --tests`.
