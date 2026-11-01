-- ============================================================
-- 0003_rls_storage.sql
-- Forum Komunitas (MVP) — Row Level Security dan Storage Policy
-- Sumber: docs/PRD.md bagian 17 dan bagian 9 (Storage Foto)
-- Jalankan SETELAH 0001 dan 0002.
--
-- Prinsip: TOLAK SEMUA, lalu izinkan seperlunya. Insert dibatasi per kolom
-- agar klien tidak bisa mengisi score, is_hidden, role, status, used_count.
--
-- Penguatan di luar teks PRD (sesuai aturan keras orkestrator), masing-masing
-- diberi komentar "PENGUATAN":
--   1. reports: insert dibatasi kolom (klien tidak bisa mengisi status).
--   2. invite_codes: insert/update dibatasi kolom (klien tidak bisa mengisi
--      used_count; hanya trigger handle_new_user yang menaikkannya).
--   3. posts_feed / comments_view / get_feed: hak akses anon dicabut
--      (default privilege Supabase otomatis memberi grant ke anon;
--      PRD hanya mengizinkan authenticated).
-- ============================================================

-- ============ Aktifkan RLS ============
alter table profiles enable row level security;
alter table app_settings enable row level security;
alter table invite_codes enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;
alter table posts enable row level security;
alter table post_images enable row level security;
alter table comments enable row level security;
alter table votes enable row level security;
alter table reports enable row level security;
alter table mod_actions enable row level security;

-- ===== Hak kolom (column-level grants) =====
revoke insert, update on profiles, posts, comments from authenticated;
grant update (avatar_url, bio) on profiles to authenticated;
grant insert (community_id, author_id, title, body, is_anonymous) on posts to authenticated;
grant update (title, body, is_deleted) on posts to authenticated;
grant insert (post_id, parent_id, author_id, body) on comments to authenticated;
grant update (is_deleted) on comments to authenticated;

-- PENGUATAN: laporan hanya lewat kolom yang aman; status default 'open'
-- dan tidak bisa diisi klien (RPC moderasi tak terpengaruh karena
-- security definer).
revoke insert, update, delete on reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason, note) on reports to authenticated;

-- PENGUATAN: used_count hanya diubah trigger handle_new_user (security
-- definer); admin mengelola kode lewat kolom lain.
revoke insert, update, delete on invite_codes from authenticated;
grant insert (code, created_by, max_uses, expires_at) on invite_codes to authenticated;
grant update (max_uses, expires_at) on invite_codes to authenticated;

-- ===== profiles =====
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ===== app_settings, invite_codes (admin / moderator) =====
create policy settings_admin on app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy invite_mod_select on invite_codes for select to authenticated using (public.is_moderator());
create policy invite_admin_write on invite_codes for insert to authenticated with check (public.is_admin());
create policy invite_admin_update on invite_codes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===== communities & keanggotaan =====
create policy comm_select on communities for select to authenticated using (true);
create policy comm_admin on communities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy members_select_own on community_members for select to authenticated using (user_id = auth.uid());
create policy members_join on community_members for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy members_leave on community_members for delete to authenticated using (user_id = auth.uid());

-- ===== posts (baca mentah hanya penulis / moderator; klien memakai view) =====
create policy posts_select on posts for select to authenticated
  using (author_id = auth.uid() or public.is_moderator());
create policy posts_insert on posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_user());
create policy posts_update_own on posts for update to authenticated
  using (author_id = auth.uid() and public.is_active_user())
  with check (author_id = auth.uid());

-- ===== post_images =====
create policy pimg_select on post_images for select to authenticated
  using (exists (select 1 from public.posts_feed f where f.id = post_id)
         or exists (select 1 from posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_moderator())));
create policy pimg_insert on post_images for insert to authenticated
  with check (public.is_active_user() and public.can_upload()
              and exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));
create policy pimg_delete on post_images for delete to authenticated
  using (exists (select 1 from posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_moderator())));

-- ===== comments =====
create policy comments_select on comments for select to authenticated
  using (author_id = auth.uid() or public.is_moderator());
create policy comments_insert on comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_user());
create policy comments_update_own on comments for update to authenticated
  using (author_id = auth.uid() and public.is_active_user())
  with check (author_id = auth.uid());

-- ===== votes =====
create policy votes_select_own on votes for select to authenticated using (user_id = auth.uid());
create policy votes_insert on votes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy votes_update on votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy votes_delete on votes for delete to authenticated using (user_id = auth.uid());

-- ===== reports =====
create policy reports_insert on reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_active_user());
create policy reports_select on reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_moderator());

-- ===== mod_actions (hanya baca; tulis lewat RPC) =====
create policy modact_select on mod_actions for select to authenticated using (public.is_moderator());

-- PENGUATAN: view dan feed RPC hanya untuk authenticated.
-- (Supabase memberi grant default ke anon untuk objek baru di schema public.)
revoke select on public.posts_feed, public.comments_view from anon;
revoke execute on function public.get_feed(uuid, text, int, int, boolean) from anon;

-- ============================================================
-- Storage (bucket dan policy) — PRD bagian 9 dan bagian Storage di 17
-- Path foto: {user_id}/{uuid}.webp; batas 1 MB (post) / 512 KB (avatar);
-- MIME: image/webp, image/jpeg, image/png.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-images', 'post-images', true, 1048576, array['image/webp','image/jpeg','image/png']),
  ('avatars', 'avatars', true, 524288, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing; -- aman bila file dijalankan ulang manual

create policy st_upload_own on storage.objects for insert to authenticated
  with check (
    bucket_id in ('post-images','avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
    and public.can_upload()
  );

create policy st_delete_own on storage.objects for delete to authenticated
  using (bucket_id in ('post-images','avatars') and (storage.foldername(name))[1] = auth.uid()::text);

create policy st_delete_mod on storage.objects for delete to authenticated
  using (bucket_id in ('post-images','avatars') and public.is_moderator());

-- Catatan keamanan (PRD): bucket publik — URL bisa dibuka siapa saja yang
-- tahu path-nya (UUID acak). Foto dari post yang dihapus dibersihkan lewat
-- tombol hapus moderator atau job pembersihan berkala (di sisi app/cron,
-- bukan migrasi). Komentar di MVP tidak bisa anonim.
