-- ============================================================
-- supabase/tests/rls_checks.sql
-- Uji RLS manual — Forum Komunitas (MVP)
--
-- CARA PAKAI:
--   1. Jalankan di Supabase SQL Editor (koneksi sebagai postgres) SETELAH
--      semua migrasi 0001-0004 berhasil.
--   2. Hasil dilihat di tab Messages/hasil: setiap cek luar "OK ..." atau
--      "GAGAL ...". Tidak boleh ada satupun baris "GAGAL".
--   3. Aman dijalankan ulang: setiap skenario dibungkus BEGIN ... ROLLBACK,
--      dan bagian CLEANUP di akhir menghapus semua data uji.
--
-- SIMULASI IDENTITAS:
--   SET LOCAL ROLE anon / authenticated + SET LOCAL request.jwt.claims
--   (sub = id pengguna uji). Catatan: dijalankan sebagai postgres yang
--   merupakan anggota role anon/authenticated di Supabase.
--
-- PENGGUNA UJI (dibuat lewat auth.users sehingga trigger handle_new_user
-- membuat profilnya):
--   11111111-... = rls_admin  (pendaftar pertama -> admin otomatis)
--   22222222-... = rls_mod    (moderator, pakai kode undangan)
--   33333333-... = rls_budi   (anggota biasa aktif, pemilik post uji)
--   44444444-... = rls_sari   (anggota biasa, di-suspend di setup)
-- ============================================================

-- ============ SETUP DATA UJI (sebagai postgres, melewati RLS pemilik) ============
-- PENTING: dibungkus BEGIN..COMMIT eksplisit. Bila seluruh berkas dijalankan
-- sebagai satu query string (runner/SQL editor), PostgreSQL membungkusnya
-- dalam SATU transaksi implisit; ROLLBACK skenario pertama akan ikut
-- membatalkan SETUP. COMMIT di sini mengunci data uji sebelum skenario jalan.
begin;

insert into invite_codes (code, max_uses) values ('TESTKODE1', 10);

insert into auth.users (id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at) values
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','rls-admin@test.local',
   jsonb_build_object('username','rls_admin'), now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','rls-mod@test.local',
   jsonb_build_object('username','rls_mod','invite_code','TESTKODE1'), now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated','rls-budi@test.local',
   jsonb_build_object('username','rls_budi','invite_code','TESTKODE1'), now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444','authenticated','authenticated','rls-sari@test.local',
   jsonb_build_object('username','rls_sari','invite_code','TESTKODE1'), now(), now(), now());

insert into communities (id, slug, name, description) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','umum-rls','Umum (uji)','Komunitas khusus pengujian RLS');

insert into community_members (community_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444');

insert into posts (id, community_id, author_id, title, body) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333','Post uji dari Budi','Isi post uji untuk pengujian RLS.');

-- rls_mod diangkat jadi moderator (dipakai skenario 8)
update profiles set role = 'moderator' where id = '22222222-2222-2222-2222-222222222222';

-- Sari di-suspend 7 hari (dipakai skenario 10)
update profiles set status = 'suspended', suspended_until = now() + interval '7 days'
  where id = '44444444-4444-4444-4444-444444444444';

commit;

-- ============ SKENARIO 1: anonim tidak bisa insert post ============
begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  insert into posts (community_id, author_id, title, body)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','coba anon','x');
  raise notice 'GAGAL S1: anonim BISA insert post (seharusnya ditolak)';
exception
  when insufficient_privilege then
    raise notice 'OK S1: anonim tidak bisa insert post -> %', sqlerrm;
end $$;
rollback;

-- ============ SKENARIO 2: anonim tidak bisa membaca feed ============
begin;
set local role anon;
do $$
declare v int;
begin
  select count(*) into v from public.posts_feed;
  raise notice 'GAGAL S2: anonim bisa membaca posts_feed (% baris)', v;
exception
  when insufficient_privilege then
    raise notice 'OK S2: anonim tidak bisa membaca posts_feed -> %', sqlerrm;
end $$;
rollback;

-- ============ SKENARIO 3: user biasa tidak bisa menyentuh kolom terlarang ============
-- score / is_hidden pada posts, dan role / status pada profiles (colom grants).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
begin
  begin
    update posts set score = score + 100 where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    raise notice 'GAGAL S3a: user biasa bisa update kolom score';
  exception when insufficient_privilege then
    raise notice 'OK S3a: update kolom posts.score ditolak';
  end;
  begin
    update posts set is_hidden = true where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    raise notice 'GAGAL S3b: user biasa bisa update kolom is_hidden';
  exception when insufficient_privilege then
    raise notice 'OK S3b: update kolom posts.is_hidden ditolak';
  end;
  begin
    update profiles set role = 'admin', status = 'active' where id = auth.uid();
    raise notice 'GAGAL S3c: user biasa bisa update role/status sendiri';
  exception when insufficient_privilege then
    raise notice 'OK S3c: update profiles.role/status ditolak';
  end;
end $$;
rollback;

-- ============ SKENARIO 4: user biasa tidak bisa post atas nama orang lain ============
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
begin
  insert into posts (community_id, author_id, title, body)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','post spoof','x');
  raise notice 'GAGAL S4: user bisa membuat post dengan author_id orang lain';
exception
  when insufficient_privilege then
    raise notice 'OK S4: insert post dengan author_id orang lain ditolak (RLS with check)';
end $$;
rollback;

-- ============ SKENARIO 5: user biasa tidak bisa baca/buat kode undangan ============
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v int;
begin
  begin
    insert into invite_codes (code, max_uses) values ('BAJAKAN1', 99);
    raise notice 'GAGAL S5a: user biasa bisa membuat kode undangan';
  exception when insufficient_privilege then
    raise notice 'OK S5a: user biasa tidak bisa insert invite_codes';
  end;
  select count(*) into v from invite_codes;
  if v = 0 then
    raise notice 'OK S5b: user biasa tidak melihat baris invite_codes apa pun';
  else
    raise notice 'GAGAL S5b: user biasa melihat % baris invite_codes', v;
  end if;
end $$;
rollback;

-- ============ SKENARIO 6: pemilik bisa mengedit postnya sendiri ============
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_rows int; v_edited timestamptz;
begin
  update posts set title = 'Post uji dari Budi (direvisi)', body = 'Isi revisi.'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    returning edited_at into v_edited;
  get diagnostics v_rows = row_count;
  if v_rows = 1 and v_edited is not null then
    raise notice 'OK S6: pemilik bisa mengedit postnya sendiri, edited_at = %', v_edited;
  else
    raise notice 'GAGAL S6: edit post sendiri gagal (rows = %, edited_at = %)', v_rows, v_edited;
  end if;
end $$;
rollback;

-- ============ SKENARIO 7: user lain tidak bisa mengedit post orang lain ============
-- (admin pun bukan penulis -> kebijakan posts_update_own tidak cocok -> 0 baris)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare v_rows int;
begin
  update posts set title = 'dirampas' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise notice 'OK S7: user lain tidak bisa mengedit post orang lain (0 baris)';
  else
    raise notice 'GAGAL S7: post orang lain ikut terubah (% baris)', v_rows;
  end if;
end $$;
rollback;

-- ============ SKENARIO 8: post tersembunyi tidak muncul di feed user biasa ============
-- Moderator menyembunyikan lewat RPC (tercatat di mod_actions), lalu user
-- biasa memeriksa feed.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_hidden int; v_feed int;
begin
  perform public.mod_apply_action('hide','post','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','uji otomatis');
  select count(*) into v_hidden from posts where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and is_hidden;
  if v_hidden = 1 then
    raise notice 'OK S8a: moderator menyembunyikan post via RPC (is_hidden = true)';
  else
    raise notice 'GAGAL S8a: RPC mod_apply_action tidak menyembunyikan post';
  end if;

  -- pindah identitas ke sari (user biasa) dalam transaksi yang sama
  perform set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  select count(*) into v_feed from public.posts_feed where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v_feed = 0 then
    raise notice 'OK S8b: post tersembunyi tidak muncul di feed user biasa';
  else
    raise notice 'GAGAL S8b: post tersembunyi masih tampil di feed';
  end if;
end $$;
rollback;

-- ============ SKENARIO 9: vote milik sendiri + trigger skor ============
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_score int;
begin
  insert into votes (user_id, target_type, target_id, value)
  values (auth.uid(), 'post', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1);
  select score into v_score from public.posts_feed where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v_score = 1 then raise notice 'OK S9a: vote +1 -> score = 1';
  else raise notice 'GAGAL S9a: score = % (seharusnya 1)', v_score; end if;

  update votes set value = -1
    where user_id = auth.uid() and target_type = 'post' and target_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select score into v_score from public.posts_feed where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v_score = -1 then raise notice 'OK S9b: ganti vote ke -1 -> score = -1';
  else raise notice 'GAGAL S9b: score = % (seharusnya -1)', v_score; end if;

  delete from votes
    where user_id = auth.uid() and target_type = 'post' and target_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select score into v_score from public.posts_feed where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v_score = 0 then raise notice 'OK S9c: hapus vote -> score kembali 0';
  else raise notice 'GAGAL S9c: score = % (seharusnya 0)', v_score; end if;
end $$;
rollback;

-- ============ SKENARIO 10: akun suspend tidak bisa menulis ============
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
begin
  begin
    insert into posts (community_id, author_id, title, body)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','post sari','x');
    raise notice 'GAGAL S10a: akun suspend masih bisa membuat post';
  exception when insufficient_privilege then
    raise notice 'OK S10a: akun suspend tidak bisa membuat post (is_active_user = false)';
  end;
  begin
    insert into comments (post_id, author_id, body)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','komentar sari');
    raise notice 'GAGAL S10b: akun suspend masih bisa berkomentar';
  exception when insufficient_privilege then
    raise notice 'OK S10b: akun suspend tidak bisa berkomentar (is_active_user = false)';
  end;
end $$;
rollback;

-- ============ CLEANUP (sebagai postgres) ============
-- Urutan penting: mod_actions/invite_codes menunjuk profiles tanpa ON DELETE.
delete from mod_actions where moderator_id in (
  '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from posts where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
delete from communities where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from invite_codes where code = 'TESTKODE1';
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444');
