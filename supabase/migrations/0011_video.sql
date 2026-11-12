-- ============================================================
-- 0011_video.sql
-- Forum Komunitas — Pasca-MVP 15: video pendek pada post (PRD bagian 15)
-- Jalankan SETELAH 0010. TANPA BEGIN/COMMIT (orkestrator yang membungkus).
--
-- Isi:
--   1. Kolom baru posts.video_url (nullable — post tanpa video tetap sah).
--   2. Ulangi seluruh grant kolom posts dari 0003 dengan TAMBAHAN video_url
--      pada INSERT. video_url SENGAJA TIDAK diberi grant UPDATE: video tidak
--      bisa diedit setelah post dibuat (editPost hanya title/body).
--   3. REKREASI view public.posts_feed menambah p.video_url di daftar kolom.
--      Definisi disalin persis dari migrasi 0002 (baris 349-361, definisi
--      terakhir view — tidak ada migrasi lain yang mendefinisikannya ulang);
--      kolom/logika lain TIDAK diubah.
--
-- Catatan: video_url hanya diisi saat pembuatan post (createPost menerima
-- URL hasil uploadVideo ke Vercel Blob di path videos/{user_id}/{uuid});
-- setelah itu kolom tidak pernah diubah klien (tidak ada grant update).
-- ============================================================

-- 1) Kolom video_url (idempoten — aman dijalankan ulang).
alter table public.posts add column if not exists video_url text;

-- 2) Hak kolom posts — ulang persis pola 0003 (revoke dulu agar hasil akhir
--    deterministik, tidak menumpuk dengan grant lama).
revoke insert, update on public.posts from authenticated;
grant insert (community_id, author_id, title, body, is_anonymous, video_url)
  on public.posts to authenticated;
grant update (title, body, is_deleted) on public.posts to authenticated;
-- video_url TIDAK ada di grant update di atas → klien tak bisa mengganti/
-- menghapus video lewat editPost (keputusan Pasca-MVP 15).

-- 3) Rekreasi view posts_feed (kolom sama dengan 0002 + p.video_url).
--    Catatan: video_url hanya diisi saat pembuatan post; post anonim tetap
--    menyembunyikan author (video ikut tampil karena milik post, bukan
--    identitas penulis).
create or replace view public.posts_feed as
select
  p.id, p.community_id, p.title, p.body, p.score, p.comment_count,
  p.is_anonymous, p.created_at, p.edited_at,
  case when p.is_anonymous then null else p.author_id end as author_id,
  case when p.is_anonymous then null else pr.username end as author_username,
  case when p.is_anonymous then null else pr.avatar_url end as author_avatar,
  (p.author_id = auth.uid()) as is_mine,
  (select v.value from votes v
    where v.user_id = auth.uid() and v.target_type = 'post' and v.target_id = p.id) as my_vote,
  p.video_url
from posts p
join profiles pr on pr.id = p.author_id
where p.is_hidden = false and p.is_deleted = false;

-- Keamanan view (pola PENGUATAN 0003): hak anon dicabut; create or replace
-- mempertahankan ACL lama, pernyataan ini idempoten sebagai jaga-jaga.
revoke select on public.posts_feed from anon;
grant select on public.posts_feed to authenticated;
