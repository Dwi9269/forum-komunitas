# FASE 1 — DB-AGENT

## [FASE 1] DB-AGENT -> ORCHESTRATOR
- Selesai: 4 migrasi Supabase berurutan (skema, fungsi/trigger/RPC, RLS+storage, seed) + 1 file uji RLS manual (10 skenario), semua disalin setia dari PRD bagian 8, 9, 16, 17.
- File yang dibuat/diubah:
  - supabase/migrations/0001_schema.sql
  - supabase/migrations/0002_functions_triggers.sql
  - supabase/migrations/0003_rls_storage.sql
  - supabase/migrations/0004_seed.sql
  - supabase/tests/rls_checks.sql
  - docs/handoff/FASE1-DB.md (file ini)
- Kontrak yang disediakan:
  - Tabel: `profiles` (profil+role member/moderator/admin, status), `invite_codes` (kode undangan, used_count dikelola trigger), `communities` + `community_members`, `posts` (score/comment_count/is_hidden/is_deleted), `post_images` (storage_path), `comments` (thread depth<=3), `votes` (PK user+target, value -1/1), `reports` (auto-hide 3 laporan), `mod_actions` (log moderasi), `app_settings` (key-value jsonb).
  - View: `posts_feed` — satu-satunya cara klien membaca post; menyembunyikan author_id/username/avatar untuk post anonim, memfilter is_hidden/is_deleted, menyertakan `is_mine` dan `my_vote`. `comments_view` — komentar untuk klien; baris terhapus/tersembunyi tampil sebagai `is_removed=true` dengan body/author null.
  - RPC: `get_feed(p_community, p_sort 'new'|'hot', p_limit<=50, p_offset, p_only_joined)` untuk feed; `mod_apply_action(p_action, p_target_type, p_target_id, p_reason, p_days)` untuk semua aksi moderasi (selalu mencatat mod_actions); `mod_dismiss_reports(p_target_type, p_target_id)`.
  - Helper: `is_moderator()`, `is_admin()`, `is_active_user()`, `can_upload()` (akun >= 24 jam untuk upload foto).
  - Trigger otomatis: profil+validasi kode undangan saat signup (`handle_new_user` di auth.users), skor vote, comment_count, auto-hide saat 3 laporan open, rate limit (akun <7 hari: 5 post & 30 komentar/jam; biasa: 20 & 120; moderator/admin bebas), `edited_at` saat post diedit.
  - Storage: bucket publik `post-images` (1 MB, webp/jpeg/png) dan `avatars` (512 KB), path `{user_id}/{uuid}`, upload hanya ke folder sendiri.
- Yang dibutuhkan dari agent lain: tidak ada. Catatan untuk FE/AUTH: saat signup, kirim `username` dan `invite_code` di `raw_user_meta_data` (pengejaan persis); klien TIDAK pernah membaca tabel `posts`/`comments` langsung — hanya `posts_feed`/`comments_view`/`get_feed`; penulis menghapus post sendiri dengan `update posts set is_deleted = true`; upload foto ke path `{user_id}/{uuid}.webp` lalu insert `post_images`. Job pembersihan file storage saat post dihapus ada di sisi app/cron (bukan migrasi).
- Asumsi / keputusan:
  - Bug PRD: tidak ditemukan bug yang membuat SQL PRD tidak bisa jalan — SQL bagian 16 disalin apa adanya. Perubahan yang dilakukan (semua tercatat sebagai komentar "PENGUATAN"/"Catatan" di file):
    1. Tabel `app_settings` (PRD 16.1) dipindah ke 0001 dan baris seed-nya ke 0004 — hanya urutan, tanpa ubah semantik.
    2. (Aturan keras orkestrator; PRD tidak membatasi) `reports`: insert dibatasi kolom `(reporter_id, target_type, target_id, reason, note)` — klien tidak bisa mengisi `status`; update/delete di-revoke. `invite_codes`: insert dibatasi `(code, created_by, max_uses, expires_at)`, update hanya `(max_uses, expires_at)` — klien tidak bisa mengisi `used_count` (hanya trigger `handle_new_user`, security definer). RPC moderasi tidak terpengaruh (security definer).
    3. `revoke select` pada `posts_feed`/`comments_view` dan `revoke execute` pada `get_feed` dari role `anon` — default privilege Supabase otomatis memberi grant ke anon, padahal PRD hanya mengizinkan `authenticated` (akses via undangan).
    4. Seed `app_settings`, seed komunitas, dan insert bucket memakai `on conflict do nothing` agar aman dijalankan ulang manual di SQL Editor.
    5. PRD memakai CHECK constraint, bukan tipe ENUM — diikuti.
    6. Slug 5 komunitas awal (umum, curhat, jual-beli, teknologi, hobi) dan deskripsinya dipilih sendiri — PRD hanya menyebut namanya (contoh PRD memakai `c/umum`).
    7. View sengaja dibuat dengan default `security_invoker = false` — klien tidak diberi SELECT tabel mentah, feed butuh eksekusi hak pemilik. Jangan diubah ke `security_invoker = true`.
  - Risiko terbuka (tidak diubah, sesuai PRD): `mod_actions.moderator_id` dan `invite_codes.created_by` tanpa ON DELETE CASCADE → menghapus pengguna yang punya jejak moderasi/invite gagal sampai baris terkait dibersihkan (terlihat saat menyusun cleanup di file uji); username duplikat saat signup memunculkan error unique generik (bukan kode `USERNAME_INVALID`); vote pada post yang sudah hidden/deleted tidak diblokir trigger (RLS saja).
- Cara memeriksa:
  1. Project Supabase baru/kosong. Di SQL Editor jalankan berurutan: `0001_schema.sql` → `0002_functions_triggers.sql` → `0003_rls_storage.sql` → `0004_seed.sql` (atau `supabase db push` bila CLI terpasang).
  2. Jalankan `supabase/tests/rls_checks.sql` di SQL Editor; lihat tab Messages: 10 skenario harus terbaca "OK S1..S10" (S9 punya 3 sub-cek), tidak boleh ada "GAGAL".
  3. Verifikasi manual cepat: buat akun pertama via aplikasi/daftar → profil otomatis `role='admin'`; akun kedua tanpa kode undangan harus gagal dengan error `INVITE_INVALID`; 5 komunitas awal terlihat di tabel `communities`.
