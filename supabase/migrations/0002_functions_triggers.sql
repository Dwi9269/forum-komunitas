-- ============================================================
-- 0002_functions_triggers.sql
-- Forum Komunitas (MVP) — fungsi, trigger, RPC, view feed
-- Sumber: docs/PRD.md bagian 16 (SQL Lengkap: Fungsi, Trigger, dan RPC)
-- Jalankan SETELAH 0001_schema.sql, berurutan dari atas ke bawah.
--
-- Semua fungsi memakai `security definer` dengan `search_path = public`
-- agar aman (kecuali touch_post_edit yang tidak membaca tabel, sesuai PRD).
-- Tabel app_settings dipindah ke 0001; baris seed-nya ke 0004.
-- ============================================================

-- ============================================================
-- 16.1 Fungsi bantu (tabel app_settings ada di 0001, seed di 0004)
-- ============================================================

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('moderator','admin') and p.status = 'active'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

-- Boleh menulis? aktif, atau suspend yang masa hukumannya sudah lewat
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.status = 'active'
        or (p.status = 'suspended' and p.suspended_until is not null and p.suspended_until < now()))
  );
$$;

-- Boleh upload foto? akun minimal 24 jam, atau moderator/admin
create or replace function public.can_upload() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.role in ('moderator','admin') or p.created_at < now() - interval '24 hours')
  );
$$;

-- ============================================================
-- 16.2 Pendaftaran, profil otomatis, dan kode undangan
-- Pengguna pertama otomatis menjadi admin (tanpa kode undangan).
-- Pendaftar berikutnya wajib kode undangan valid; kalau tidak,
-- pendaftaran dibatalkan (exception -> rollback signup).
-- ============================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_username text := new.raw_user_meta_data->>'username';
  v_required boolean := coalesce((select (value)::boolean from app_settings where key = 'invite_required'), true);
  v_first boolean := not exists (select 1 from profiles);
begin
  if v_username is null or v_username !~ '^[a-zA-Z0-9_]{3,20}$' then
    raise exception 'USERNAME_INVALID';
  end if;

  if v_required and not v_first then
    update invite_codes
       set used_count = used_count + 1
     where code = v_code
       and used_count < max_uses
       and (expires_at is null or expires_at > now());
    if not found then
      raise exception 'INVITE_INVALID';
    end if;
  end if;

  insert into profiles (id, username, role)
  values (new.id, v_username, case when v_first then 'admin' else 'member' end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kode undangan disimpan HURUF BESAR. Contoh membuat kode (admin, dari dashboard):
-- insert into invite_codes (code, created_by, max_uses)
-- values (upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)), auth.uid(), 5);

-- ============================================================
-- 16.3 Vote, komentar, dan post
-- ============================================================

-- Skor otomatis berubah saat vote dibuat, diganti, atau dibatalkan
create or replace function public.apply_vote_delta() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int := 0; t text; i uuid;
begin
  if tg_op = 'INSERT' then
    d := new.value; t := new.target_type; i := new.target_id;
  elsif tg_op = 'UPDATE' then
    d := new.value - old.value; t := new.target_type; i := new.target_id;
  else
    d := -old.value; t := old.target_type; i := old.target_id;
  end if;

  if t = 'post' then
    update posts set score = score + d where id = i;
  else
    update comments set score = score + d where id = i;
  end if;
  return null;
end $$;

create trigger votes_delta
  after insert or update or delete on votes
  for each row execute function public.apply_vote_delta();

-- Validasi komentar: induk harus ada, satu post, kedalaman maksimal 3
create or replace function public.before_comment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p comments%rowtype;
begin
  if new.parent_id is not null then
    select * into p from comments where id = new.parent_id;
    if not found or p.post_id <> new.post_id then
      raise exception 'PARENT_INVALID';
    end if;
    if p.is_deleted or p.is_hidden then
      raise exception 'PARENT_UNAVAILABLE';
    end if;
    new.depth := p.depth + 1;
    if new.depth > 3 then
      raise exception 'DEPTH_EXCEEDED';
    end if;
  else
    new.depth := 0;
  end if;

  if exists (select 1 from posts where id = new.post_id and (is_deleted or is_hidden)) then
    raise exception 'POST_UNAVAILABLE';
  end if;
  return new;
end $$;

create trigger comments_before_insert
  before insert on comments
  for each row execute function public.before_comment_insert();

-- Jumlah komentar di post
create or replace function public.sync_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif old.is_deleted = false and new.is_deleted = true then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
  elsif old.is_deleted = true and new.is_deleted = false then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return null;
end $$;

create trigger comments_count
  after insert or update of is_deleted on comments
  for each row execute function public.sync_comment_count();

-- Tandai post yang diedit
create or replace function public.touch_post_edit() returns trigger
language plpgsql as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger posts_touch_edit
  before update on posts
  for each row execute function public.touch_post_edit();

-- ============================================================
-- 16.4 Rate limit
-- Akun < 7 hari: 5 post/jam, 30 komentar/jam.
-- Akun biasa: 20 post/jam, 120 komentar/jam. Moderator/admin dikecualikan.
-- ============================================================

create or replace function public.enforce_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_created timestamptz; v_role text; v_count int; v_limit int; v_new boolean;
begin
  select created_at, role into v_created, v_role from profiles where id = new.author_id;
  if v_role in ('moderator','admin') then
    return new;
  end if;
  v_new := v_created > now() - interval '7 days';

  if tg_table_name = 'posts' then
    select count(*) into v_count from posts
     where author_id = new.author_id and created_at > now() - interval '1 hour';
    v_limit := case when v_new then 5 else 20 end;
  else
    select count(*) into v_count from comments
     where author_id = new.author_id and created_at > now() - interval '1 hour';
    v_limit := case when v_new then 30 else 120 end;
  end if;

  if v_count >= v_limit then
    raise exception 'RATE_LIMIT';
  end if;
  return new;
end $$;

create trigger posts_rate_limit before insert on posts
  for each row execute function public.enforce_rate_limit();
create trigger comments_rate_limit before insert on comments
  for each row execute function public.enforce_rate_limit();

-- ============================================================
-- 16.5 Auto-hide dari laporan
-- Bila 3 akun berbeda melaporkan konten yang sama (status masih 'open'),
-- konten otomatis disembunyikan sampai moderator meninjau.
-- ============================================================

create or replace function public.after_report_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(distinct reporter_id) into n from reports
   where target_type = new.target_type and target_id = new.target_id and status = 'open';

  if n >= 3 then
    if new.target_type = 'post' then
      update posts set is_hidden = true where id = new.target_id;
    elsif new.target_type = 'comment' then
      update comments set is_hidden = true where id = new.target_id;
    end if;
  end if;
  return null;
end $$;

create trigger reports_auto_hide
  after insert on reports
  for each row execute function public.after_report_insert();

-- ============================================================
-- 16.6 RPC moderasi
-- Semua tindakan moderasi lewat fungsi ini (bukan update tabel langsung),
-- sehingga selalu tercatat di mod_actions.
-- ============================================================

create or replace function public.mod_apply_action(
  p_action text, p_target_type text, p_target_id uuid,
  p_reason text default null, p_days int default 3
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_role text;
begin
  if not public.is_moderator() then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('hide','delete','warn','suspend','ban','restore') then
    raise exception 'ACTION_INVALID';
  end if;
  if p_target_type = 'user' and p_action in ('hide','delete') then
    raise exception 'ACTION_INVALID';
  end if;

  if p_target_type = 'post' then
    select author_id into v_user from posts where id = p_target_id;
  elsif p_target_type = 'comment' then
    select author_id into v_user from comments where id = p_target_id;
  elsif p_target_type = 'user' then
    v_user := p_target_id;
  else
    raise exception 'TARGET_INVALID';
  end if;
  if v_user is null then raise exception 'NOT_FOUND'; end if;

  select role into v_role from profiles where id = v_user;
  if v_role = 'admin' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  if p_action = 'hide' then
    if p_target_type = 'post' then update posts set is_hidden = true where id = p_target_id;
    else update comments set is_hidden = true where id = p_target_id; end if;

  elsif p_action = 'delete' then
    if p_target_type = 'post' then update posts set is_deleted = true where id = p_target_id;
    else update comments set is_deleted = true where id = p_target_id; end if;

  elsif p_action = 'restore' then
    if p_target_type = 'post' then update posts set is_hidden = false, is_deleted = false where id = p_target_id;
    elsif p_target_type = 'comment' then update comments set is_hidden = false, is_deleted = false where id = p_target_id;
    else update profiles set status = 'active', suspended_until = null where id = p_target_id; end if;

  elsif p_action = 'suspend' then
    update profiles set status = 'suspended', suspended_until = now() + make_interval(days => p_days)
     where id = v_user;

  elsif p_action = 'ban' then
    update profiles set status = 'banned', suspended_until = null where id = v_user;
  end if;
  -- 'warn' hanya dicatat, tidak mengubah data

  if p_action <> 'restore' then
    update reports set status = 'resolved'
     where target_type = p_target_type and target_id = p_target_id and status = 'open';
  end if;

  insert into mod_actions (moderator_id, action, target_type, target_id, reason)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason);
end $$;

-- Tolak laporan: konten dinilai tidak melanggar, tampilkan kembali
create or replace function public.mod_dismiss_reports(p_target_type text, p_target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'FORBIDDEN'; end if;

  update reports set status = 'dismissed'
   where target_type = p_target_type and target_id = p_target_id and status = 'open';

  if p_target_type = 'post' then
    update posts set is_hidden = false where id = p_target_id;
  elsif p_target_type = 'comment' then
    update comments set is_hidden = false where id = p_target_id;
  end if;

  insert into mod_actions (moderator_id, action, target_type, target_id, reason)
  values (auth.uid(), 'restore', p_target_type, p_target_id, 'laporan ditolak');
end $$;

-- ============================================================
-- 16.7 View feed, view komentar, dan fungsi feed
-- Tabel posts dan comments TIDAK dibaca langsung oleh klien.
-- Klien membaca lewat view di bawah: identitas penulis post anonim
-- disembunyikan, isi konten yang dihapus/disembunyikan dikosongkan.
--
-- Catatan: view dibuat dengan default security_invoker = false (eksekusi
-- dengan hak pemilik) — ini disengaja, karena RLS posts/comments hanya
-- mengizinkan penulis/moderator membaca tabel mentah. JANGAN diubah ke
-- security_invoker = true.
-- ============================================================

create or replace view public.posts_feed as
select
  p.id, p.community_id, p.title, p.body, p.score, p.comment_count,
  p.is_anonymous, p.created_at, p.edited_at,
  case when p.is_anonymous then null else p.author_id end as author_id,
  case when p.is_anonymous then null else pr.username end as author_username,
  case when p.is_anonymous then null else pr.avatar_url end as author_avatar,
  (p.author_id = auth.uid()) as is_mine,
  (select v.value from votes v
    where v.user_id = auth.uid() and v.target_type = 'post' and v.target_id = p.id) as my_vote
from posts p
join profiles pr on pr.id = p.author_id
where p.is_hidden = false and p.is_deleted = false;

create or replace view public.comments_view as
select
  c.id, c.post_id, c.parent_id, c.depth, c.score, c.created_at,
  (c.is_deleted or c.is_hidden) as is_removed,
  case when c.is_deleted or c.is_hidden then null else c.body end as body,
  case when c.is_deleted or c.is_hidden then null else c.author_id end as author_id,
  case when c.is_deleted or c.is_hidden then null else pr.username end as author_username,
  case when c.is_deleted or c.is_hidden then null else pr.avatar_url end as author_avatar,
  (c.author_id = auth.uid()) as is_mine,
  (select v.value from votes v
    where v.user_id = auth.uid() and v.target_type = 'comment' and v.target_id = c.id) as my_vote
from comments c
join profiles pr on pr.id = c.author_id;

grant select on public.posts_feed, public.comments_view to authenticated;

-- Feed: sort 'new' (terbaru) atau 'hot' (populer)
-- Rumus populer (gaya Hacker News): (max(skor,0) + 1) / (umur_jam + 2)^1.5
create or replace function public.get_feed(
  p_community uuid default null,
  p_sort text default 'new',
  p_limit int default 20,
  p_offset int default 0,
  p_only_joined boolean default false
) returns setof public.posts_feed
language sql stable as $$
  select f.* from public.posts_feed f
  where (p_community is null or f.community_id = p_community)
    and (not p_only_joined or f.community_id in (
          select m.community_id from community_members m where m.user_id = auth.uid()))
  order by
    case when p_sort = 'hot'
      then (greatest(f.score, 0) + 1) / power(extract(epoch from (now() - f.created_at)) / 3600 + 2, 1.5)
    end desc nulls last,
    f.created_at desc
  limit least(p_limit, 50) offset greatest(p_offset, 0)
$$;
