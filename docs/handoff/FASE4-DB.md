# FASE 4 — DB-AGENT

## [FASE 4] DB-AGENT -> ORCHESTRATOR/BACKEND-AGENT
- Selesai: 1 migrasi baru `0005_community_stats.sql` — view statistik komunitas (definer) + grant/revoke mengikuti pola 0003. RPC moderasi target 'user' dicek terhadap PRD 16.6: SUDAH didukung implementasi live 0002, jadi TIDAK ada fungsi baru — hanya komentar hasil pengecekan di dalam file (file tetap wajib ada sesuai instruksi).
- File yang dibuat/diubah:
  - supabase/migrations/0005_community_stats.sql
  - docs/handoff/FASE4-DB.md (file ini)
- Kontrak yang disediakan:
  - View `public.community_stats` — nama kolom PERSIS:
    - `community_id uuid` (id komunitas; satu baris per komunitas, semua komunitas termasuk yang kosong)
    - `member_count bigint` (jumlah baris `community_members` komunitas itu)
    - `post_count bigint` (jumlah post komunitas itu yang TIDAK `is_deleted` dan TIDAK `is_hidden`)
  - View dibuat `security_invoker = false` (definer, disengaja — sama dengan `posts_feed`/`comments_view`): angka terbaca penuh oleh semua `authenticated` tanpa perlu role khusus. JANGAN diubah ke `security_invoker = true` (RLS `community_members`/`posts` akan membuat angka jadi 0/salah untuk user biasa).
  - Hak akses: `grant select on public.community_stats to authenticated;` dan `revoke select ... from anon;` (anon permission denied).
  - RPC moderasi (tidak berubah, sudah live sejak 0002): `mod_apply_action(p_action, p_target_type, p_target_id, p_reason default null, p_days default 3)` mendukung `p_target_type='user'` untuk `suspend` (pakai `p_days`), `ban`, dan `restore` (reaktivasi: status kembali `active`, `suspended_until` null); `hide`/`delete` terhadap user ditolak `ACTION_INVALID`; moderator tidak bisa menindak admin; setiap aksi selalu tercatat di `mod_actions`.
- Yang dibutuhkan dari agent lain:
  - ORCHESTRATOR: terapkan `0005_community_stats.sql` via `scripts/run-migrations.mjs` (urut setelah 0004; file idempoten — `create or replace view` + `alter view ... set`).
  - BACKEND-AGENT: untuk halaman `/c/[slug]` (PRD 18.2.3) dan daftar komunitas, baca angka dari `community_stats` (mis. `.from('community_stats').select('*')` atau filter `.eq('community_id', id)`) — JANGAN menghitung sendiri dari tabel mentah `community_members`/`posts` (RLS akan membatasi). Untuk suspend/ban/reaktivasi user di dashboard admin, panggil RPC `mod_apply_action` yang sudah ada (lihat kontrak di atas); tidak ada RPC baru.
- Asumsi / keputusan:
  - `member_count` = jumlah baris `community_members` (gabung/keluar menambah/menghapus baris — PRD 18.2.2); tidak mengecualikan anggota yang suspended/banned (PRD tidak memintanya).
  - `post_count` mengikuti instruksi orkestrator: tidak `is_deleted` DAN tidak `is_hidden` (PRD 18.2.3 sendiri hanya menyebut "jumlah anggota").
  - View tanpa filter komunitas: komunitas tanpa anggota/post tampil dengan nilai 0, agar daftar komunitas lengkap tanpa join tambahan.
  - Grant/revoke meniru pola 0003: Supabase memberi default privilege SELECT ke `anon` untuk objek baru di schema public, maka dicabut.
  - `security_invoker` adalah opsi PostgreSQL 15+ — aman untuk Supabase saat ini (PG15/16/17); baris `alter view ... set (security_invoker = false)` ada karena `create or replace view` tidak menimpa opsi view yang sudah ada (jaga-jaga bila view sempat dibuat manual saat uji).
  - Bug PRD: tidak ditemukan — SQL PRD 16.6 identik dengan implementasi live 0002 dan sudah mendukung target 'user', sehingga tidak ada fungsi tambahan di 0005 (sesuai instruksi, cukup komentar; file tetap ada karena view).
- Cara memeriksa:
  1. ORCHESTRATOR: jalankan migrasi 0005 via `scripts/run-migrations.mjs` (atau SQL Editor, urut setelah 0004). Jalankan dua kali untuk bukti idempoten — tidak boleh ada error.
  2. Di SQL Editor sebagai authenticated: `select * from public.community_stats;` → semua baris komunitas muncul dengan angka penuh. Bandingkan dengan `select count(*) from community_members where community_id = '<id>';` dan `select count(*) from posts where community_id = '<id>' and not is_deleted and not is_hidden;` (angka harus sama; sebagai user biasa dua query ini terbatas RLS, itu wajar).
  3. Sebagai anon (SQL Editor mode anon / request tanpa login): `select * from public.community_stats;` harus `permission denied`.
  4. RPC user (sudah live dari 0002, tidak diubah 0005): dari akun moderator panggil `select mod_apply_action('suspend','user','<uuid>','alasan',7);` → profil jadi `status='suspended'`, `suspended_until ≈ now()+7 hari`, baris baru di `mod_actions`; `'ban'` → `status='banned'`; `'restore'` → `status='active'`, `suspended_until` null. Non-moderator → exception `FORBIDDEN`; `'hide'`/`'delete'` pada target user → exception `ACTION_INVALID`.
