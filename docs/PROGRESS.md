# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [ ] Fase 1: Fondasi (migrasi DB, scaffold Next.js, komponen dasar) — **BERJALAN**
- [ ] Fase 2: Akun (auth, kode undangan, peta error)
- [ ] Fase 3: Inti forum (feed, post, komentar, vote, komunitas)
- [ ] Fase 4: Foto dan moderasi
- [ ] Fase 5: Audit independen (QA)
- [ ] Fase 6: Rilis (DevOps)

## Status agent — Fase 1

| Agent | Tugas | Status |
|---|---|---|
| DB-AGENT | `supabase/migrations/0001-0004` + `supabase/tests/rls_checks.sql` | berjalan |
| BACKEND-AGENT | scaffold Next.js, klien Supabase, middleware, `lib/errors.ts` | berjalan |
| FRONTEND-AGENT | layout, globals.css, halaman placeholder, komponen ui dasar | berjalan |

## Gerbang

- Gerbang 1: migrasi jalan dari DB kosong **(belum — butuh kredensial Supabase)**; app jalan di localhost **(belum diverifikasi)**; RLS aktif di semua tabel **(belum diverifikasi)**.

## Hambatan terbuka

- Kredensial Supabase (Project URL, anon key, service role key) belum tersedia — migrasi belum bisa dijalankan dan diverifikasi.
- Node lokal v18.20.8 (tanpa PATH): pakai path penuh `C:\Program Files\nodejs`; karena itu skill memakai **Tailwind v3.4** (bukan v4 yang butuh Node 20) dan **Next 15**.
- Git awalnya belum terpasang; diinstall via winget pada 2026-11-01.

## Catatan sesi

- 2026-11-01: sesi pertama. Persiapan awal selesai (PRD disalin ke `docs/PRD.md`, git diinisialisasi, dokumen orkestrasi dibuat). Fase 1 dimulai dengan 3 agent paralel.
