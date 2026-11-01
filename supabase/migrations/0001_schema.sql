-- ============================================================
-- 0001_schema.sql
-- Forum Komunitas (MVP) — skema database
-- Sumber: docs/PRD.md bagian 8 (Skema Database) dan 16.1 (app_settings)
-- Jalankan PALING AWAL pada project Supabase yang masih kosong.
--
-- Catatan:
-- - PRD memakai CHECK constraint (bukan tipe ENUM) untuk kolom bernilai
--   terbatas (role, status, value, reason, action, target_type) — mengikuti PRD.
-- - Tabel app_settings (didefinisikan di PRD 16.1) dipindah ke file ini agar
--   semua tabel selesai sebelum fungsi/trigger (0002) dan seed (0004).
--   Kolom dan semantik tidak diubah.
-- ============================================================

-- Ekstensi
create extension if not exists "pgcrypto";

-- ============ PROFIL ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  avatar_url text,
  bio text check (char_length(bio) <= 200),
  role text not null default 'member' check (role in ('member','moderator','admin')),
  status text not null default 'active' check (status in ('active','suspended','banned')),
  suspended_until timestamptz,
  created_at timestamptz not null default now()
);

-- ============ KODE UNDANGAN ============
create table invite_codes (
  code text primary key,
  created_by uuid references profiles(id),
  max_uses int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ KOMUNITAS ============
create table communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table community_members (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

-- ============ POST ============
create table posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 10000),
  is_anonymous boolean not null default false,
  score int not null default 0,
  comment_count int not null default 0,
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index posts_community_created_idx on posts (community_id, created_at desc);
create index posts_score_idx on posts (score desc, created_at desc);

create table post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  storage_path text not null,
  width int,
  height int,
  position smallint not null default 0
);

-- ============ KOMENTAR ============
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  depth smallint not null default 0 check (depth <= 3),
  score int not null default 0,
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id, created_at);

-- ============ VOTE ============
create table votes (
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- ============ LAPORAN & MODERASI ============
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','porn','violence_sara','doxxing','other')),
  note text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table mod_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references profiles(id),
  action text not null check (action in ('hide','delete','warn','suspend','ban','restore')),
  target_type text not null,
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ============ PENGATURAN APLIKASI ============
-- (dipindah dari PRD 16.1; baris seed-nya ada di 0004_seed.sql)
create table app_settings (
  key text primary key,
  value jsonb not null
);
