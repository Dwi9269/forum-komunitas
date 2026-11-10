-- ============================================================
-- 0008_notifications.sql
-- Notifikasi (Pasca-MVP 15: "Notifikasi dan DM" — DM di luar cakupan).
-- Sumber: docs/PRD.md bagian 15 baris 321-329 + instruksi Fase Notifikasi.
-- Jalankan SETELAH 0001-0007.
--
-- Prinsip:
-- - Klien HANYA bisa membaca notifikasinya sendiri dan mengubah kolom
--   `is_read` (grant kolom, pola 0003). INSERT/DELETE tidak diberikan ke
--   klien sama sekali — baris notifikasi HANYA dibuat trigger security
--   definer di bawah (berjalan sebagai pemilik, melewati RLS).
-- - Semua trigger pemberi notifikasi melakukan skip self-notify
--   (pelaku = penerima → tidak ada notifikasi).
-- - Guard konten: notifikasi komentar/vote tidak dikirim bila post tujuan
--   sudah is_deleted/is_hidden (jangan ganggu pengguna yang kontennya
--   sudah dimoderasi).
--
-- Tanpa BEGIN/COMMIT di sini: runner migrasi (scripts/run-migrations.mjs)
-- sudah membungkus file dalam satu transaksi.
-- Semua pernyataan idempoten-amann (if not exists / or replace / drop if
-- exists) agar aman dijalankan ulang manual di SQL Editor.
-- ============================================================

-- ============ Tabel ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Pelaku (yang memicu notifikasi); null = notifikasi sistem.
  actor_id uuid references public.profiles(id) on delete set null,
  tipe text not null check (tipe in ('komentar','balasan','vote_post','vote_comment','status_akun')),
  -- Post tujuan untuk navigasi (untuk vote_comment diisi post induk komentar).
  post_id uuid references public.posts(id) on delete cascade,
  -- Teks siap tampil (terisi untuk 'status_akun'); null → UI menyusun teks
  -- dari tipe + username pelaktu agar tidak basi saat username berubah.
  pesan text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ Index ============
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where is_read = false;

-- ============ RLS ============
alter table public.notifications enable row level security;

-- Hak kolom (pola 0003): default privilege Supabase memberi ALL ke
-- anon/authenticated/service_role → cabut dulu, lalu berikan yang aman.
-- PENGUATAN: insert & delete TIDAK diberikan ke klien (hanya trigger
-- security definer); update hanya kolom is_read (tandai dibaca).
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Trigger: komentar & balasan ============
-- AFTER INSERT ON comments: bila post target masih ada dan tampil —
--   'balasan'  → penulis komentar induk (bila parent_id ada),
--   'komentar' → penulis post (posts.author_id).
-- Skip: pelaku = penerima; duplikasi penerima (bila penulis induk = penulis
-- post, kirim satu saja, utamakan 'balasan'); post is_deleted/is_hidden.
create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
begin
  -- Guard: post target harus ada dan masih tampil.
  select p.author_id into v_post_author
  from public.posts p
  where p.id = new.post_id
    and p.is_deleted = false
    and p.is_hidden = false;
  if not found then
    return new;
  end if;

  -- 'balasan' ke penulis komentar induk (bila ada) — skip self.
  if new.parent_id is not null then
    select c.author_id into v_parent_author
    from public.comments c
    where c.id = new.parent_id;
    if found and v_parent_author is distinct from new.author_id then
      insert into public.notifications (user_id, actor_id, tipe, post_id)
      values (v_parent_author, new.author_id, 'balasan', new.post_id);
    end if;
  end if;

  -- 'komentar' ke penulis post — skip self dan skip bila dia sudah menerima
  -- 'balasan' (penerima sama cukup satu notifikasi per komentar baru).
  if v_post_author is distinct from new.author_id
     and v_post_author is distinct from v_parent_author then
    insert into public.notifications (user_id, actor_id, tipe, post_id)
    values (v_post_author, new.author_id, 'komentar', new.post_id);
  end if;

  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ============ Trigger: vote ============
-- AFTER INSERT ON votes: HANYA bila value = 1 (upvote) → 'vote_post' /
-- 'vote_comment' ke pemilik target; skip self; skip bila target
-- is_deleted/is_hidden. Ganti vote (UPDATE) tidak memberi notifikasi.
create or replace function public.notify_on_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_post_id uuid;
begin
  if new.value <> 1 then
    return new;
  end if;

  if new.target_type = 'post' then
    select p.author_id, p.id into v_author, v_post_id
    from public.posts p
    where p.id = new.target_id
      and p.is_deleted = false
      and p.is_hidden = false;
  elsif new.target_type = 'comment' then
    select c.author_id, c.post_id into v_author, v_post_id
    from public.comments c
    where c.id = new.target_id
      and c.is_deleted = false
      and c.is_hidden = false;
  else
    return new;
  end if;

  if found and v_author is not null
     and v_author is distinct from new.user_id then
    insert into public.notifications (user_id, actor_id, tipe, post_id)
    values (v_author, new.user_id,
            case when new.target_type = 'post' then 'vote_post' else 'vote_comment' end,
            v_post_id);
  end if;
  return new;
end $$;

drop trigger if exists votes_notify on public.votes;
create trigger votes_notify
  after insert on public.votes
  for each row execute function public.notify_on_vote();

-- ============ Trigger: perubahan status akun ============
-- AFTER UPDATE ON profiles: bila status berubah KE 'suspended'/'banned'
-- (berbeda dari old.status) → 'status_akun' ke user itu dengan pesan jelas.
-- actor_id null = sistem; status kembali ke 'active' tidak diberi notifikasi.
create or replace function public.notify_on_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'suspended' and new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, tipe, pesan)
    values (new.id, null, 'status_akun',
            'Akunmu disuspend sampai '
            || coalesce(to_char(new.suspended_until, 'DD Mon YYYY'),
                        'tanggal yang ditentukan admin'));
  elsif new.status = 'banned' and new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, tipe, pesan)
    values (new.id, null, 'status_akun',
            'Akunmu diblokir. Untuk banding, hubungi admin lewat email.');
  end if;
  return new;
end $$;

drop trigger if exists profiles_notify_status on public.profiles;
create trigger profiles_notify_status
  after update on public.profiles
  for each row execute function public.notify_on_status_change();
