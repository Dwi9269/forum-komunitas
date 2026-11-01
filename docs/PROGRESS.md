# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [x] Fase 1: Fondasi — **kode selesai, Gerbang 1 PARSAIAL** (menunggu kredensial Supabase untuk verifikasi DB)
- [ ] Fase 2: Akun (auth, kode undangan, peta error) — berikutnya
- [ ] Fase 3: Inti forum (feed, post, komentar, vote, komunitas)
- [ ] Fase 4: Foto dan moderasi
- [ ] Fase 5: Audit independen (QA)
- [ ] Fase 6: Rilis (DevOps)

## Status agent — Fase 1 (selesai)

| Agent | Tugas | Status |
|---|---|---|
| DB-AGENT | `supabase/migrations/0001-0004` + `supabase/tests/rls_checks.sql` (10 skenario uji RLS) | selesai |
| BACKEND-AGENT | scaffold Next.js 15, klien Supabase lazy, middleware, `lib/errors.ts` | selesai |
| FRONTEND-AGENT | layout, `globals.css`, `tailwind.config.ts`, Beranda placeholder, kit `components/ui/` | selesai |

## Gerbang 1

- App build dari nol: **LULUS** — `npm install` (118 paket) + `next build` sukses (Next 15.5.28, 4 halaman statis, tipe valid).
- Migrasi jalan dari DB kosong: **BELUM TERVERIFIKASI** — butuh kredensial Supabase.
- RLS aktif di semua tabel: **BELUM TERVERIFIKASI** — jalankan `supabase/tests/rls_checks.sql` setelah migrasi.

## Hambatan terbuka

- **Kredensial Supabase (Project URL, anon key, service role key) menunggu dari user** — satu-satunya penghalang Gerbang 1 dan Fase 2.
- Node lokal v18.20.8 (tidak di PATH): panggil via `set "PATH=C:\Program Files\nodejs;%PATH%"`. Konsekuensi: **Tailwind v3.4** (bukan v4) dan **Next 15** (bukan 16). Bisa dimigrasi bila Node di-upgrade.
- Git tidak terpasang sistem; pakai **MinGit portable** di `%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe` (install winget ditolak UAC). Identitas commit memakai config global user.

## Catatan sesi

- 2026-11-01: sesi pertama. Persiapan awal selesai; Fase 1 dikerjakan 3 agent paralel (DB/BACKEND/FRONTEND), handoff di `docs/handoff/FASE1-*.md` dan digabung ke `HANDOFF.md`. Build lolos. Warning minor Edge Runtime dari `@supabase/realtime-js` lewat import `lib/supabase/middleware.ts` — tidak fatal, bisa dioptimalkan nanti. Perbaikan kecil DB-AGENT atas PRD (penguatan kolom `reports`/`invite_codes`, revoke akses `anon` pada view) tercatat di handoff.
