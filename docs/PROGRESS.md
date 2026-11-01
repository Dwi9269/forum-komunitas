# PROGRESS — Forum Komunitas (MVP)

Diupdate oleh ORCHESTRATOR. Sumber kebenaran fitur: `docs/PRD.md`.

## Checklist fase

- [x] Fase 1: Fondasi — kode selesai, Gerbang 1 parsial (menunggu kredensial Supabase untuk verifikasi DB)
- [x] Fase 2: Akun — kode selesai, Gerbang 2 parsial (alur register/login perlu DB)
- [x] Fase 3: Inti forum — kode selesai, Gerbang 3 parsial (feed/post/komentar/vote perlu DB)
- [ ] Fase 4: Foto dan moderasi — berikutnya
- [ ] Fase 5: Audit independen (QA)
- [ ] Fase 6: Rilis (DevOps) — target user: hosting di domain chatasiquqe (my.id/web.id/biz.id) via Vercel

## Status agent — Fase 2 & 3 (selesai)

| Agent | Tugas | Status |
|---|---|---|
| BACKEND | Fase 2: `lib/actions/auth.ts` (register/login/logout/reset/getSessionUser) + 10 kode error baru | selesai |
| FRONTEND | Fase 2: `app/(auth)/*` (login, register, reset, reset/confirm) + `AccountStatusBanner` | selesai |
| BACKEND | Fase 3: `lib/actions/{communities,posts,comments,votes}.ts` + `comment-tree.ts` + `validate.ts` | selesai |
| FRONTEND | Fase 3: `app/(main)/*` (feed, komunitas, detail post, submit) + PostCard/VoteButtons/CommentTree | selesai |

## Perbaikan integrasi oleh ORCHESTRATOR (mismatch kontrak antar agent paralel)

1. `components/CommentForm.tsx`: field `content` → `body` (kontrak `CreateCommentInput`).
2. `components/SubmitPostForm.tsx`: field `content` → `body` (kontrak `CreatePostInput`).
3. `components/VoteButtons.tsx`: `setVote({postId,value})` → wrapper `setVotePost(postId, value)`.
4. `components/feed/server-data.ts`: `getCommunity` → `getCommunityBySlug`.

## Gerbang

- Build total: **LULUS** (Next 15.5.28 — 9 rute: /, /c/[slug], /p/[id], /submit, /login, /register, /reset, /reset/confirm, middleware OK).
- Semua gerbang runtime (migrasi, RLS, alur akun, feed, vote) **menunggu kredensial Supabase** — satu-satunya penghalang.

## Hambatan terbuka

- **Kredensial Supabase (Project URL, anon key, service role key) menunggu dari user.**
- Node 18 → @supabase/supabase-js memberi warning deprecation (tidak fatal). Upgrade Node 20+ disarankan sebelum rilis.
- Domain hosting: rekomendasi chatasiquqe.my.id (tercatat di OPEN_QUESTIONS no. 8).

## Catatan sesi

- 2026-11-01: Fase 1-3 selesai dikode dalam 1 sesi (5 gelombang agent paralel). Handoff FASE1-3 digabung ke HANDOFF.md. Dev server berjalan di background saat tidak sedang build (jangan jalankan `next build` dan `next dev` bersamaan — konflik `.next`).
