# PRD: Forum Komunitas (MVP)

Nama sementara: **\[Nama App\]** · Versi 0.1 · Dibuat 1 November 2026

## 1. Ringkasan

Forum komunitas ala Reddit/Threads untuk umum, dengan target awal 500–1.000 pengguna. Pengguna bisa ngobrol bebas lewat teks dan foto. Video **tidak** masuk MVP. Dibangun cepat dengan bantuan AI memakai Next.js + Supabase, di-deploy di Vercel, dengan satu domain (misalnya `.my.id`).

## 2. Tujuan dan Non-Tujuan

**Tujuan**

- Rilis MVP yang jalan dan bisa dipakai 20–30 orang uji coba dalam hitungan hari.
- Pengalaman ngobrol santai dan blak-blakan, nyaman di HP.
- Biaya operasional mendekati nol di fase awal.
- Moderasi cukup agar konten ilegal bisa dihapus cepat.

**Non-Tujuan (belum dikerjakan)**

- Upload video
- Chat/DM, notifikasi push, livestream
- Aplikasi native (cukup web responsif/PWA)
- Monetisasi, iklan
- Multi-bahasa

## 3. Target Pengguna

- **Anggota**: orang umum yang mau ngobrol, curhat, debat, atau berbagi foto. Akses utama lewat HP.
- **Moderator/Admin**: kamu dan 1–2 orang tepercaya yang menangani laporan.

Strategi awal: akses lewat **kode undangan** supaya komunitas kecil tetap sehat.

## 4. Fitur MVP

### 4.1 Akun dan Autentikasi

- Daftar/login dengan email + password (Supabase Auth). Opsi tambahan: login Google.
- Daftar hanya dengan **kode undangan** yang valid (bisa dimatikan lewat pengaturan).
- Profil: username unik, avatar (opsional), bio singkat.
- Akun baru (di bawah 24 jam) belum bisa upload foto.

### 4.2 Komunitas (Kategori)

- Beberapa ruang bertopik, misalnya: Umum, Curhat, Jual-Beli, Teknologi, Hobi.
- Hanya admin yang membuat/menghapus komunitas di MVP.
- Pengguna bisa bergabung/keluar dari komunitas (join), dan feed berisi komunitas yang diikuti.

### 4.3 Post

- Buat post: judul, isi teks, dan hingga 4 foto.
- Hapus/edit post milik sendiri (edit menampilkan label "diedit").
- Opsi **posting anonim** (username disembunyikan di tampilan publik; admin tetap bisa melihat penulis asli untuk moderasi).
- Urutan feed: Terbaru dan Populer (berdasarkan skor + waktu).

### 4.4 Komentar

- Komentar bertingkat (balasan) hingga kedalaman 3.
- Hapus komentar milik sendiri.

### 4.5 Vote

- Upvote/downvote untuk post dan komentar, satu suara per pengguna per item.
- Skor = upvote − downvote.

### 4.6 Moderasi

- Tombol **Laporkan** pada post/komentar dengan alasan (spam, porno, SARA/kekerasan, doxxing, lainnya).
- Dashboard admin: daftar laporan, hapus konten, banned/suspend pengguna.
- Konten yang dilaporkan oleh 3 akun berbeda disembunyikan otomatis sementara sampai ditinjau.
- Log tindakan moderasi.

### 4.7 Upload dan Kompres Foto

- Format: JPG, PNG, WebP. Maksimal 10 MB sebelum kompres.
- Kompres di sisi klien sebelum upload: resize sisi terpanjang ke 1600 px, konversi ke WebP kualitas ±0,8. Target 200–400 KB per foto.
- Simpan ke Supabase Storage, path per pengguna.
- Hapus metadata EXIF (lokasi GPS) demi privasi.

## 5. Aturan Komunitas (Ringkas)

Bebas: bahasa kasar, opini keras, curhat, debat.

Dilarang tegas:

1. Konten porno dan segala konten yang melibatkan anak di bawah umur (langsung banned dan dihapus).
2. Ancaman, ajakan kekerasan, dan SARA yang memicu kekerasan.
3. Doxxing (membongkar data pribadi orang lain).
4. Penipuan dan spam.
5. Konten ilegal lain menurut hukum Indonesia.

Sanksi: hapus konten → peringatan → suspend → banned permanen.

## 6. Halaman dan Alur

| Halaman | Rute | Keterangan |
| --- | --- | --- |
| Landing/Login | `/login` | Login dan daftar (dengan kode undangan) |
| Beranda | `/` | Feed gabungan komunitas yang diikuti |
| Komunitas | `/c/[slug]` | Feed per komunitas |
| Detail post | `/p/[id]` | Post, komentar, balasan |
| Buat post | `/submit` | Form teks + foto |
| Profil | `/u/[username]` | Post dan komentar pengguna |
| Pengaturan | `/settings` | Edit profil, ganti password |
| Admin | `/admin` | Laporan, pengguna, undangan, komunitas |

**Alur utama**: Daftar dengan kode undangan → pilih komunitas → buka feed → buat post (foto dikompres otomatis) → orang lain vote dan komentar → pelanggaran dilaporkan → moderator menindak.

## 7. Arsitektur dan Tech Stack

- **Frontend/Backend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Database + Auth + Storage**: Supabase (PostgreSQL, Row Level Security)
- **Hosting**: Vercel
- **Domain**: satu domain (mis. `.my.id`) dengan DNS diarahkan ke Vercel
- **Kompres foto**: library `browser-image-compression` di klien
- **Opsional nanti**: Cloudflare R2 untuk storage bila foto membesar; moderasi gambar otomatis

Alur: Pengguna → Domain → Vercel (Next.js) → Supabase (DB, Auth, Storage).

Catatan: domain hanya alamat. Data teks ada di database, foto di storage.

## 8. Skema Database (PostgreSQL / Supabase)

```sql
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
```

### Trigger penting

- **Skor vote**: setelah insert/update/delete pada `votes`, hitung ulang `score` di `posts` atau `comments`.
- **Jumlah komentar**: tambah/kurangi `comment_count` saat komentar dibuat/dihapus.
- **Auto-hide**: bila jumlah laporan `open` untuk satu target mencapai 3, set `is_hidden = true`.
- **Profil otomatis**: saat pengguna baru terdaftar di `auth.users`, buat baris di `profiles`.
- **Kode undangan**: validasi dan tambah `used_count` saat pendaftaran (lewat fungsi server).

### Row Level Security (garis besar)

- `profiles`: semua orang bisa baca; hanya pemilik yang bisa ubah profil sendiri (tidak termasuk `role` dan `status`).
- `posts` dan `comments`: baca bila `is_hidden = false` dan `is_deleted = false` (moderator bisa baca semua); insert hanya untuk pengguna login berstatus `active`; update/delete hanya oleh penulis atau moderator.
- `votes`: pengguna hanya mengelola suara miliknya.
- `reports`: pengguna hanya insert dan melihat laporannya sendiri; moderator melihat semua.
- `invite_codes`, `mod_actions`: hanya admin/moderator.
- **Anonim**: kolom `author_id` tidak boleh terekspos ke publik untuk post anonim. Sajikan lewat view atau fungsi yang menyembunyikan penulis bila `is_anonymous = true`.

## 9. Storage Foto

- Bucket: `post-images` (publik untuk baca) dan `avatars`.
- Path: `{user_id}/{uuid}.webp`.
- Policy: pengguna login hanya boleh upload ke folder miliknya, batas 1 MB per file setelah kompres (jaga-jaga).
- Tipe MIME diizinkan: `image/webp`, `image/jpeg`, `image/png`.
- Saat post dihapus, file terkait ikut dihapus lewat job pembersihan.

### Alur kompres di klien

1. Pengguna memilih foto (maks 10 MB).
2. Validasi tipe file.
3. Kompres: resize sisi terpanjang 1600 px, WebP kualitas ±0,8, batas target 0,4 MB, EXIF dibuang.
4. Upload ke Supabase Storage.
5. Simpan `storage_path`, lebar, dan tinggi ke `post_images`.

## 10. Kebutuhan Non-Fungsional

- **Performa**: halaman feed termuat di bawah 2 detik di jaringan 4G; paginasi atau infinite scroll 20 post per muat.
- **Responsif**: mobile-first.
- **Keamanan**: RLS aktif di semua tabel, validasi di sisi server, rate limit (maks 5 post/jam dan 30 komentar/jam per akun baru), proteksi spam.
- **Privasi**: EXIF dibuang, email tidak ditampilkan publik.
- **Biaya**: tetap di tier gratis Supabase dan Vercel pada fase awal; pantau penggunaan storage.
- **Kepatuhan**: sediakan Syarat & Ketentuan, Kebijakan Privasi, mekanisme laporan dan penurunan konten. Pelajari kewajiban pendaftaran PSE di Indonesia bila platform dibuka luas.

## 11. Metrik Keberhasilan

- 20–30 pengguna uji coba aktif dalam minggu pertama.
- Minimal 50% pengguna uji coba kembali di minggu kedua.
- Waktu rata-rata penanganan laporan di bawah 12 jam.
- Penggunaan storage di bawah 70% kuota gratis.

## 12. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Konten ilegal (porno, kekerasan, eksploitasi anak) | Tinggi, hukum | Undangan, akun baru dibatasi, laporan, auto-hide, moderator aktif, hapus dan banned segera |
| Spam dan bot | Sedang | Rate limit, kode undangan, verifikasi email |
| Storage penuh | Sedang | Kompres wajib, batas ukuran, pindah ke Cloudflare R2 |
| Forum sepi | Tinggi | Mulai dari lingkaran kecil, ajak teman, isi konten awal |
| Moderator kewalahan | Sedang | Tambah moderator, aturan jelas, auto-hide |
| Penyalahgunaan anonim | Sedang | Admin tetap bisa melihat penulis asli, log tindakan |

## 13. Rencana Pengerjaan

| Tahap | Isi | Perkiraan |
| --- | --- | --- |
| 0 | Putuskan nama, beli **satu** domain, buat proyek Supabase dan Vercel | Hari 1 |
| 1 | Skema DB, RLS, auth, kode undangan | Hari 1–2 |
| 2 | Komunitas, post, komentar, vote | Hari 2–4 |
| 3 | Upload foto + kompres | Hari 4–5 |
| 4 | Laporan, dashboard admin, auto-hide | Hari 5–6 |
| 5 | Uji coba 20–30 orang, perbaiki bug | Hari 7–10 |
| 6 | Buka bertahap, pantau, pertimbangkan video | Setelah itu |

## 14. Pertanyaan Terbuka

1. Nama aplikasi dan domain final?
2. Tetap pakai kode undangan atau buka bebas daftar sejak awal?
3. Anonim diaktifkan di MVP atau ditunda?
4. Siapa 1–2 moderator tepercaya?
5. Login Google dipakai atau cukup email?

## 15. Pengembangan Berikutnya (Pasca-MVP)

- Upload video pendek (30–60 detik) dengan moderasi otomatis
- Notifikasi dan DM
- Pencarian
- Peran moderator per komunitas
- Moderasi gambar otomatis
- PWA dan notifikasi push

## 16. SQL Lengkap: Fungsi, Trigger, dan RPC

Jalankan **setelah** skema di bagian 8, berurutan dari atas ke bawah, di Supabase SQL Editor. Semua fungsi memakai `security definer` dengan `search_path = public` agar aman.

### 16.1 Pengaturan aplikasi dan fungsi bantu

```sql
create table app_settings (
  key text primary key,
  value jsonb not null
);
insert into app_settings (key, value) values ('invite_required', 'true'::jsonb);

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
```

### 16.2 Pendaftaran, profil otomatis, dan kode undangan

Pengguna pertama yang mendaftar otomatis menjadi **admin** (tanpa kode undangan). Untuk pendaftar berikutnya, kode undangan divalidasi di dalam trigger. Bila tidak valid, pendaftaran dibatalkan (rollback) dan app menampilkan pesan dari kode error.

```sql
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
```

Kode undangan disimpan **huruf besar**. Contoh membuat kode (dijalankan admin dari dashboard): `insert into invite_codes (code, created_by, max_uses) values (upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)), auth.uid(), 5);`

### 16.3 Vote, komentar, dan post

```sql
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
```

### 16.4 Rate limit

Akun berumur kurang dari 7 hari dibatasi lebih ketat. Moderator dan admin dikecualikan.

| Aksi | Akun baru (< 7 hari) | Akun biasa |
| --- | --- | --- |
| Post per jam | 5 | 20 |
| Komentar per jam | 30 | 120 |

```sql
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
```

### 16.5 Auto-hide dari laporan

Bila 3 akun berbeda melaporkan konten yang sama (status laporan masih `open`), konten otomatis disembunyikan sampai moderator meninjau.

```sql
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
```

### 16.6 RPC moderasi

Semua tindakan moderasi lewat fungsi ini (bukan update tabel langsung), sehingga selalu tercatat di `mod_actions`.

```sql
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
```

### 16.7 View feed, view komentar, dan fungsi feed

Tabel `posts` dan `comments` **tidak dibaca langsung** oleh klien. Klien membaca lewat view di bawah, yang menyembunyikan identitas penulis post anonim dan mengosongkan isi konten yang dihapus atau disembunyikan.

```sql
create view public.posts_feed as
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

create view public.comments_view as
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
```

Rumus populer (gaya Hacker News): `(max(skor, 0) + 1) / (umur_jam + 2)^1.5`. Post baru dengan sedikit vote bisa naik, dan post lama turun perlahan. Pada sort `new`, urutan murni berdasarkan waktu.

## 17. Row Level Security dan Storage Policy

Prinsip: **tolak semua, lalu izinkan seperlunya**. Insert dibatasi per kolom agar klien tidak bisa mengisi `score`, `is_hidden`, `role`, dan sejenisnya.

```sql
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
```

### Storage (bucket dan policy)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-images', 'post-images', true, 1048576, array['image/webp','image/jpeg','image/png']),
  ('avatars', 'avatars', true, 524288, array['image/webp','image/jpeg','image/png']);

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
```

Catatan keamanan: bucket bersifat publik (URL bisa dibuka siapa saja yang tahu path-nya, yang berupa UUID acak). Foto dari post yang dihapus dibersihkan lewat tombol hapus moderator atau job pembersihan berkala. Komentar di MVP **tidak** bisa anonim.

## 18. Kriteria Selesai (Acceptance Criteria)

Sebuah fitur dianggap **selesai** bila semua poin di bawahnya terpenuhi. Format: Jika (kondisi) maka (hasil).

### 18.1 Akun dan autentikasi

1. Jika pengguna mengisi email, password (min. 8 karakter), username valid, dan kode undangan valid, maka akun dibuat, email verifikasi terkirim, dan kode undangan bertambah `used_count` sebanyak 1.
2. Jika kode undangan salah, kedaluwarsa, atau sudah habis dipakai, maka pendaftaran gagal dan tampil pesan `INVITE_INVALID`. Tidak ada akun yang terbentuk.
3. Jika username sudah dipakai atau formatnya salah, maka tampil pesan yang jelas dan tidak ada akun yang terbentuk.
4. Jika email belum diverifikasi, maka pengguna bisa login tetapi hanya bisa membaca (tidak bisa posting, komentar, vote).
5. Jika pengguna pertama mendaftar di database kosong, maka akunnya otomatis menjadi `admin` tanpa kode undangan.
6. Jika pengguna berstatus `banned`, maka semua aksi tulis ditolak dan muncul banner penjelasan beserta cara banding.
7. Jika pengguna berstatus `suspended`, maka banner menampilkan tanggal berakhirnya sanksi, dan setelah lewat tanggal itu aksi tulis otomatis berfungsi kembali.
8. Jika pengguna logout, maka sesi dihapus dan halaman terproteksi mengarahkan ke `/login`.

### 18.2 Komunitas

1. Beranda menampilkan post dari komunitas yang diikuti. Jika belum mengikuti satu pun, tampil ajakan memilih komunitas.
2. Tombol Gabung/Keluar langsung berubah tanpa reload dan tersimpan di `community_members`.
3. Halaman `/c/[slug]` menampilkan nama, deskripsi, jumlah anggota, dan feed komunitas itu.
4. Hanya admin yang melihat tombol buat/edit/hapus komunitas.

### 18.3 Post

1. Jika judul 1–200 karakter dan isi maksimal 10.000 karakter, maka post tersimpan dan pengguna diarahkan ke halaman detail post.
2. Jika judul kosong, tombol Kirim nonaktif dan tampil pesan validasi.
3. Jika pengguna melampirkan foto, maka tiap foto dikompres di klien sebelum upload, dan post baru muncul setelah semua upload sukses.
4. Jika salah satu upload foto gagal, maka pengguna bisa mencoba ulang foto itu saja tanpa mengisi ulang form. Post tidak tersimpan setengah-setengah.
5. Maksimal 4 foto per post. Foto kelima ditolak dengan pesan jelas.
6. Jika opsi anonim dicentang, maka nama dan avatar penulis tidak tampil ke siapa pun kecuali moderator di halaman admin.
7. Penulis bisa mengedit judul dan isi. Label (diedit) muncul. Foto tidak bisa diedit di MVP.
8. Penulis bisa menghapus post. Post hilang dari feed dan detail (soft delete).
9. Akun yang kena rate limit melihat pesan `RATE_LIMIT` dan sisa waktu tunggu perkiraan.
10. Akun berumur kurang dari 24 jam melihat tombol foto nonaktif dengan penjelasan alasannya.

### 18.4 Komentar

1. Jika komentar 1–5.000 karakter dikirim, maka langsung muncul di posisi yang benar dan `comment_count` bertambah.
2. Balasan pada komentar kedalaman 3 tidak tersedia (tombol Balas disembunyikan).
3. Komentar yang dihapus/disembunyikan tampil sebagai teks abu-abu **\[komentar dihapus\]** tanpa nama dan isi, tetapi balasan di bawahnya tetap terlihat.
4. Komentar tidak bisa dikirim ke post yang sudah dihapus atau disembunyikan (`POST_UNAVAILABLE`).
5. Urutan komentar: skor tertinggi dahulu, lalu waktu terlama, per tingkat.

### 18.5 Vote

1. Klik panah naik: skor +1. Klik lagi: vote dibatalkan (skor kembali). Klik panah turun saat sudah vote naik: skor berubah −2 dari kondisi awal ke turun.
2. Tampilan skor berubah seketika (optimistic update) dan dikembalikan bila server menolak.
3. Pengguna tidak bisa vote ganda pada item yang sama (dijamin oleh primary key `votes`).
4. Pengguna tanpa verifikasi email atau yang disuspend tidak bisa vote, tombol tampak nonaktif.

### 18.6 Laporan dan moderasi

1. Tombol Laporkan membuka dialog berisi pilihan alasan dan catatan opsional. Laporan terkirim dan muncul ucapan terima kasih.
2. Satu akun hanya bisa melaporkan satu item satu kali. Laporan kedua menampilkan pesan Kamu sudah melaporkan ini.
3. Pada laporan ketiga dari akun berbeda, konten otomatis hilang dari feed pengguna lain.
4. Dashboard admin menampilkan antrean laporan terbuka, diurutkan dari yang paling banyak dilaporkan, lengkap dengan cuplikan konten, penulis asli (meski anonim), dan alasan.
5. Tombol Hapus, Sembunyikan, Peringatkan, Suspend (pilih 1/3/7/30 hari), Banned, dan Tolak laporan bekerja dan tercatat di `mod_actions`.
6. Moderator tidak bisa menindak admin. Admin bisa menindak semua.

### 18.7 Foto

1. File non-gambar atau lebih dari 10 MB sebelum kompres ditolak dengan pesan jelas.
2. Hasil kompres berukuran di bawah 1 MB dan bertipe WebP (kecuali browser tidak mendukung, jatuh ke JPEG).
3. Metadata EXIF (termasuk GPS) tidak ada pada file hasil upload.
4. Pratinjau foto tampil sebelum kirim, dan foto bisa dihapus dari daftar sebelum kirim.

## 19. Alur Akun Lengkap

| Skenario | Perilaku |
| --- | --- |
| Daftar | Form: email, username, password, kode undangan. Setelah sukses, tampil halaman Cek emailmu untuk verifikasi. |
| Verifikasi email | Tautan di email mengarah ke app dan langsung login. Tautan kedaluwarsa menampilkan tombol Kirim ulang. |
| Login | Email + password. Gagal 5 kali berturut-turut: tampil jeda 1 menit (ditangani Supabase). |
| Lupa password | Input email, kirim tautan reset, lalu halaman buat password baru. Pesan tetap netral, tidak membocorkan apakah email terdaftar. |
| Ganti password | Di `/settings`, wajib masukkan password baru minimal 8 karakter. |
| Ubah profil | Avatar (dikompres ke maks 512 px) dan bio maksimal 200 karakter. Username tidak bisa diganti di MVP. |
| Hapus akun | Tombol di `/settings` dengan konfirmasi mengetik username. Profil dihapus, post dan komentar ikut terhapus (cascade). Peringatan: tindakan tidak bisa dibatalkan. |
| Kena suspend | Banner merah: akunmu disuspend sampai tanggal tertentu, alasan, dan tautan Baca aturan. |
| Kena banned | Banner: akunmu diblokir, alasan, dan alamat email banding. Banding ditinjau admin secara manual. |
| Banding | Di MVP lewat email ke admin. Admin dapat memulihkan lewat tombol Pulihkan (`restore`) pada pengguna. |

## 20. Kasus Tepi dan Pesan Error

Kode error dikembalikan dari database (`raise exception`). App memetakan kode ke pesan ramah berikut.

| Kode | Pesan untuk pengguna |
| --- | --- |
| `INVITE_INVALID` | Kode undangan tidak valid, sudah dipakai habis, atau kedaluwarsa. |
| `USERNAME_INVALID` | Username harus 3–20 karakter: huruf, angka, atau garis bawah. |
| `RATE_LIMIT` | Kamu terlalu cepat. Tunggu beberapa menit lalu coba lagi. |
| `PARENT_INVALID` | Komentar yang kamu balas tidak ditemukan. |
| `PARENT_UNAVAILABLE` | Komentar yang kamu balas sudah dihapus. |
| `DEPTH_EXCEEDED` | Balasan sudah terlalu dalam. Balas komentar di atasnya. |
| `POST_UNAVAILABLE` | Post ini sudah dihapus atau disembunyikan. |
| `FORBIDDEN` | Kamu tidak punya izin untuk aksi ini. |
| RLS menolak | Akunmu tidak bisa melakukan aksi ini saat ini. Cek status akunmu. |
| Gagal jaringan | Koneksi bermasalah. Coba lagi. |

**Kasus tepi yang harus ditangani**

1. **Post dihapus saat orang lain sedang menulis komentar**: kirim komentar menampilkan `POST_UNAVAILABLE`, isi komentar tetap tersimpan di form agar tidak hilang.
2. **Akun disuspend saat sedang login**: aksi tulis ditolak oleh RLS. App membaca ulang status profil dan menampilkan banner tanpa perlu logout.
3. **Upload foto sukses tetapi simpan post gagal**: file yatim (orphan) di storage dibersihkan lewat job pembersihan mingguan (lihat bagian 23).
4. **Dua tab, vote bentrok**: kunci utama `votes` mencegah ganda. Hasil terakhir yang menang.
5. **Kode undangan dipakai bersamaan**: `update ... where used_count < max_uses` bersifat atomik, sehingga tidak bisa melebihi `max_uses`.
6. **Post punya komentar lalu dihapus penulis**: komentar tetap ada di database tetapi tidak bisa diakses karena post tersembunyi.
7. **Foto GIF atau HEIC dari iPhone**: HEIC dikonversi saat kompres bila browser mendukung. Bila tidak, tampil pesan ubah format ke JPG. GIF tidak didukung di MVP.
8. **Konten kosong setelah spasi**: input dipangkas (trim) sebelum validasi.
9. **Pengguna anonim dilaporkan**: laporan tetap diproses, moderator melihat penulis asli, publik tidak.
10. **Feed kosong**: tampil keadaan kosong (empty state) dengan ajakan buat post pertama.

## 21. Aturan Validasi Input

| Kolom | Aturan |
| --- | --- |
| Username | 3–20 karakter, `a-z A-Z 0-9 _`, unik (tidak peka huruf besar-kecil disarankan, lihat catatan) |
| Password | Minimal 8 karakter |
| Bio | Maksimal 200 karakter |
| Judul post | 1–200 karakter setelah trim |
| Isi post | Maksimal 10.000 karakter |
| Komentar | 1–5.000 karakter setelah trim |
| Foto per post | Maksimal 4 |
| Foto mentah | Maksimal 10 MB, JPG/PNG/WebP/HEIC |
| Foto setelah kompres | Maksimal 1 MB (target 200–400 KB) |
| Avatar | Maksimal 512 KB setelah kompres |
| Slug komunitas | huruf kecil, angka, tanda hubung |

Catatan: agar `Budi` dan `budi` dianggap sama, tambahkan indeks unik `create unique index on profiles (lower(username));`. Teks yang ditampilkan selalu di-escape agar tidak ada XSS. Pakai render teks biasa (bukan HTML mentah).

## 22. Wireframe dan Panduan Tampilan

Prinsip: **mobile-first**, satu kolom di HP, dua kolom (konten + sidebar) di layar lebar. Navigasi bawah di HP.

### 22.1 Beranda / Feed (HP)

```
+--------------------------------+
| [Logo]            [Cari] [Ava] |
+--------------------------------+
| [ Terbaru ]  [ Populer ]       |
+--------------------------------+
| c/umum  -  oleh budi  -  2j    |
| Judul post yang cukup panjang  |
| Cuplikan isi dua baris maks... |
| +----------------------------+ |
| |        foto pertama        | |
| +----------------------------+ |
| [^ 24 v]  [Komentar 8] [Lapor] |
+--------------------------------+
| c/curhat - Anonim - 5j         |
| ...                            |
+--------------------------------+
|  [Beranda] [Komunitas] [+] [Profil] |
+--------------------------------+
```

Elemen: tab urutan, kartu post, vote vertikal atau horizontal, jumlah komentar, menu titik tiga (Lapor, Hapus bila milik sendiri). Muat 20 post per halaman dengan tombol Muat lagi atau infinite scroll.

### 22.2 Detail post

```
+--------------------------------+
| <- Kembali            c/umum   |
+--------------------------------+
| Judul post                     |
| budi - 2 jam lalu (diedit)     |
| Isi lengkap post ...           |
| [foto 1] [foto 2]  (ketuk = besar) |
| [^ 24 v]            [Lapor]    |
+--------------------------------+
| [ Tulis komentar...        ] [Kirim] |
+--------------------------------+
| sari - 1j     [^ 3 v]          |
|   Isi komentar                 |
|   [Balas]                      |
|   |  andi - 40m   [^ 1 v]      |
|   |    Balasan tingkat 2       |
| [komentar dihapus]             |
+--------------------------------+
```

Balasan diberi indentasi dan garis vertikal tipis. Tingkat 3 ke atas tidak menambah indentasi lagi di layar sempit.

### 22.3 Buat post

```
+--------------------------------+
| Buat post                  [X] |
+--------------------------------+
| Komunitas: [ Umum         v ]  |
| Judul                          |
| [____________________] 0/200   |
| Isi                            |
| [                          ]   |
| [                          ]   |
| Foto (maks 4)                  |
| [ + ]  [thumb1 x] [thumb2 x]   |
| [ ] Posting sebagai anonim     |
| Dengan memposting kamu setuju  |
| pada aturan komunitas.         |
|              [ Kirim ]         |
+--------------------------------+
```

Saat mengirim: tombol berubah menjadi indikator proses dan menampilkan status Mengompres foto, Mengunggah, Menyimpan.

### 22.4 Dashboard admin: antrean laporan

```
+-------------------------------------------+
| Admin: [Laporan] [Pengguna] [Undangan] [Komunitas] [Log] |
+-------------------------------------------+
| Terbuka (7)   Filter: [semua alasan v]    |
+-------------------------------------------+
| POST - dilaporkan 4x - alasan: porn, spam |
| Penulis asli: @andi (anonim di publik)    |
| [cuplikan judul + isi + thumbnail blur]   |
| [Hapus] [Sembunyikan] [Peringatkan]       |
| [Suspend v] [Banned] [Tolak laporan]      |
+-------------------------------------------+
```

Thumbnail pada antrean laporan sebaiknya diburamkan (blur) sampai moderator mengklik, untuk melindungi moderator dari konten mengganggu.

### 22.5 Panduan visual

| Aspek | Keputusan |
| --- | --- |
| Gaya | Bersih, ringan, fokus pada konten |
| Warna | Satu warna aksen, latar terang dan gelap (ikuti pengaturan sistem) |
| Tipografi | Satu font sans-serif (misalnya Inter), ukuran isi 16 px agar nyaman di HP |
| Komponen | Tombol, input, kartu post, kartu komentar, dialog, toast, skeleton loading |
| Keadaan | Semua daftar punya state loading (skeleton), kosong, dan error dengan tombol coba lagi |
| Aksesibilitas | Kontras cukup, area ketuk minimal 44 px, label pada tombol ikon, bisa dipakai dengan keyboard |
| Ikon | Satu set ikon konsisten (misalnya lucide-react) |
| Performa | Gambar lazy-load, simpan lebar dan tinggi di database agar tata letak tidak melompat |

## 23. Setup Teknis dan Operasional

### 23.1 Struktur proyek

```
/app
  /(auth)/login, /(auth)/register, /(auth)/reset
  /(main)/page.tsx            # beranda
  /(main)/c/[slug]/page.tsx   # komunitas
  /(main)/p/[id]/page.tsx     # detail post
  /(main)/submit/page.tsx     # buat post
  /(main)/u/[username]/page.tsx
  /(main)/settings/page.tsx
  /admin/(reports|users|invites|communities|log)/page.tsx
  /api/cron/cleanup/route.ts  # job pembersihan
  /legal/(terms|privacy|rules)/page.tsx
/components   # PostCard, CommentTree, VoteButtons, ImagePicker, ReportDialog, dll
/lib
  /supabase/(client|server|middleware).ts
  /actions/(posts|comments|votes|reports|admin).ts
  /image/compress.ts
  /errors.ts                  # peta kode error ke pesan
/supabase/migrations          # file SQL berurutan
```

### 23.2 Environment variable

| Nama | Isi | Catatan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase | Aman di klien |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci anon | Aman di klien (dilindungi RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci service role | **Rahasia**, hanya di server dan cron. Jangan pernah di kode klien atau repo |
| `CRON_SECRET` | String acak panjang | Melindungi `/api/cron/cleanup` |
| `NEXT_PUBLIC_SITE_URL` | Alamat domain final | Untuk tautan verifikasi email |

### 23.3 Langkah penyiapan

1. **Supabase**: buat proyek, jalankan SQL bagian 8, 16, dan 17 berurutan, aktifkan Email auth dengan Confirm email, isi Site URL dan Redirect URLs (domain final dan `http://localhost:3000`).
2. **Email**: layanan email bawaan Supabase sangat terbatas jumlah kirimnya. Untuk pengguna sungguhan, sambungkan SMTP sendiri (misalnya Resend atau Brevo). Ini wajib sebelum mengundang banyak orang.
3. **Buat komunitas awal**: Umum, Curhat, Jual-Beli, Teknologi, Hobi lewat SQL atau dashboard admin.
4. **Daftar akun pertama sendiri** (otomatis jadi admin), lalu buat kode undangan.
5. **Vercel**: impor repo, isi semua environment variable, deploy.
6. **Domain**: di Vercel, tambahkan domain di Settings > Domains, lalu di panel DNS indo.domains buat record sesuai petunjuk yang ditampilkan Vercel (biasanya A record untuk root atau CNAME untuk subdomain). Tunggu propagasi, biasanya beberapa menit hingga beberapa jam.
7. **Uji ulang** daftar, login, verifikasi email, dan upload foto di domain final.

### 23.4 Operasional

| Hal | Rencana |
| --- | --- |
| Pembersihan file yatim | Cron mingguan (`/api/cron/cleanup`, dilindungi `CRON_SECRET`) membandingkan isi bucket dengan `post_images` dan `profiles.avatar_url`, lalu menghapus file yang tidak terpakai dan lebih tua dari 24 jam lewat API storage (bukan SQL langsung) |
| Proyek gratis Supabase tertidur | Proyek tanpa aktivitas lama bisa dijeda. Pastikan ada aktivitas rutin (cron ping) |
| Cadangan | Paket gratis tidak punya cadangan harian andal. Ekspor database berkala (misalnya `pg_dump` mingguan) dan simpan di tempat lain |
| Pemantauan | Cek dashboard Supabase (storage, bandwidth, database size) tiap minggu. Beri tanda bila storage di atas 70% |
| Log moderasi | Tabel `mod_actions` ditinjau admin tiap minggu |
| Rahasia | Jangan commit `.env`. Putar (rotate) kunci bila bocor |
| Konten berbahaya | Siapkan prosedur: hapus segera, simpan catatan, banned pelaku. Untuk konten eksploitasi anak, hentikan penyebaran dan laporkan ke pihak berwenang |

## 24. Kontrak Akses Data (Server Action / Query)

Semua aksi memakai klien Supabase dengan sesi pengguna (RLS aktif). Kunci service role **hanya** dipakai di cron. Validasi dilakukan dua kali: di app (pesan cepat) dan di database (penjaga terakhir).

| Aksi | Input | Operasi | Hasil | Error yang mungkin |
| --- | --- | --- | --- | --- |
| `signUp` | email, password, username, kode undangan | `auth.signUp` dengan `options.data = {username, invite_code}` | Email verifikasi terkirim | `INVITE_INVALID`, `USERNAME_INVALID`, email sudah terdaftar |
| `getFeed` | komunitas?, sort, halaman, hanya yang diikuti? | `rpc('get_feed', ...)` | Daftar post (maks 20) | jaringan |
| `getPost` | id | `from('posts_feed').select().eq('id', id).single()` | Satu post | tidak ditemukan |
| `getPostImages` | post id | `from('post_images').select().eq('post_id', id).order('position')` | Daftar foto | - |
| `getComments` | post id | `from('comments_view').select().eq('post_id', id)` lalu susun pohon di klien | Daftar komentar | - |
| `createPost` | komunitas, judul, isi, anonim, foto\[\] | Upload foto, insert `posts`, insert `post_images` | id post | `RATE_LIMIT`, RLS menolak, upload gagal |
| `editPost` | id, judul, isi | `update posts set title, body` | OK | RLS menolak |
| `deletePost` | id | `update posts set is_deleted = true` | OK | RLS menolak |
| `createComment` | post id, parent id?, isi | `insert comments` | Komentar baru | `RATE_LIMIT`, `PARENT_*`, `DEPTH_EXCEEDED`, `POST_UNAVAILABLE` |
| `deleteComment` | id | `update comments set is_deleted = true` | OK | RLS menolak |
| `setVote` | tipe, id, nilai (-1, 0, 1) | upsert atau delete pada `votes` | OK | RLS menolak |
| `joinCommunity` / `leaveCommunity` | community id | insert / delete `community_members` | OK | - |
| `report` | tipe, id, alasan, catatan | `insert reports` | OK | laporan ganda (unique) |
| `modAction` | aksi, tipe, id, alasan, hari | `rpc('mod_apply_action', ...)` | OK | `FORBIDDEN`, `ACTION_INVALID`, `NOT_FOUND` |
| `modDismiss` | tipe, id | `rpc('mod_dismiss_reports', ...)` | OK | `FORBIDDEN` |
| `getReports` | status, halaman | `from('reports').select()` lalu gabung dengan konten (khusus moderator) | Antrean | - |
| `createInvite` | maks pakai, kedaluwarsa | `insert invite_codes` | Kode | RLS menolak (bukan admin) |

## 25. Implementasi Kompres dan Upload Foto

### 25.1 Dependensi

`npm install browser-image-compression`

### 25.2 `lib/image/compress.ts`

```ts
import imageCompression from 'browser-image-compression';

const MAX_RAW_BYTES = 10 * 1024 * 1024; // 10 MB sebelum kompres
const MAX_FINAL_BYTES = 1024 * 1024;    // 1 MB batas keras setelah kompres
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
  ext: 'webp' | 'jpg';
};

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!ALLOWED.includes(file.type)) throw new Error('IMAGE_TYPE');
  if (file.size > MAX_RAW_BYTES) throw new Error('IMAGE_TOO_BIG');

  const out = await imageCompression(file, {
    maxSizeMB: 0.4,            // target sekitar 400 KB
    maxWidthOrHeight: 1600,    // sisi terpanjang maksimal 1600 px
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
    preserveExif: false,       // buang metadata termasuk GPS
  });

  if (out.size > MAX_FINAL_BYTES) throw new Error('IMAGE_STILL_BIG');

  const bmp = await createImageBitmap(out);
  const result = {
    blob: out as Blob,
    width: bmp.width,
    height: bmp.height,
    ext: (out.type === 'image/webp' ? 'webp' : 'jpg') as 'webp' | 'jpg',
  };
  bmp.close();
  return result;
}
```

### 25.3 `lib/image/upload.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { compressImage } from './compress';

export type UploadedImage = { path: string; width: number; height: number; position: number };

export async function uploadImages(
  supabase: SupabaseClient,
  userId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadedImage[]> {
  if (files.length > 4) throw new Error('IMAGE_LIMIT');
  const uploaded: UploadedImage[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const img = await compressImage(files[i]);
      const path = `${userId}/${crypto.randomUUID()}.${img.ext}`;

      const { error } = await supabase.storage.from('post-images').upload(path, img.blob, {
        contentType: img.blob.type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) throw error;

      uploaded.push({ path, width: img.width, height: img.height, position: i });
      onProgress?.(i + 1, files.length);
    }
    return uploaded;
  } catch (e) {
    // bersihkan file yang sudah terlanjur terunggah
    if (uploaded.length) {
      await supabase.storage.from('post-images').remove(uploaded.map((u) => u.path));
    }
    throw e;
  }
}

export function imageUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
```

### 25.4 Alur `createPost`

```ts
export async function createPost(supabase, userId, input) {
  // 1) kompres + upload dulu; jika gagal, tidak ada post yang dibuat
  const images = await uploadImages(supabase, userId, input.files, input.onProgress);

  // 2) simpan post
  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      community_id: input.communityId,
      author_id: userId,
      title: input.title.trim(),
      body: input.body.trim() || null,
      is_anonymous: input.isAnonymous,
    })
    .select('id')
    .single();

  if (error) {
    await supabase.storage.from('post-images').remove(images.map((i) => i.path));
    throw error;
  }

  // 3) simpan relasi foto
  if (images.length) {
    const { error: imgErr } = await supabase.from('post_images').insert(
      images.map((i) => ({ post_id: post.id, storage_path: i.path, width: i.width, height: i.height, position: i.position })),
    );
    if (imgErr) {
      await supabase.storage.from('post-images').remove(images.map((i) => i.path));
      await supabase.from('posts').update({ is_deleted: true }).eq('id', post.id);
      throw imgErr;
    }
  }
  return post.id;
}
```

### 25.5 `setVote`

```ts
export async function setVote(supabase, userId, type: 'post' | 'comment', id: string, value: -1 | 0 | 1) {
  if (value === 0) {
    return supabase.from('votes').delete().match({ user_id: userId, target_type: type, target_id: id });
  }
  return supabase.from('votes').upsert(
    { user_id: userId, target_type: type, target_id: id, value },
    { onConflict: 'user_id,target_type,target_id' },
  );
}
```

### 25.6 Catatan implementasi foto

1. Foto dari iPhone berformat HEIC hanya bisa dibaca bila browser mendukung. Bila gagal, tampilkan pesan agar memilih foto dalam format JPG.
2. Tampilkan pratinjau memakai `URL.createObjectURL` dan lepaskan dengan `URL.revokeObjectURL` setelah selesai.
3. Tampilkan `<img>` dengan atribut `width`, `height`, dan `loading=lazy`.
4. Ukuran target setelah kompres: 200–400 KB. Dengan 1 GB penyimpanan gratis, kira-kira 2.500–5.000 foto muat.
5. Pantau pemakaian storage. Rencana pindah ke Cloudflare R2 bila di atas 70% kuota.

## 26. Rencana Pengujian

### 26.1 Uji keamanan (paling penting, lakukan sebelum membuka ke orang lain)

| # | Uji | Hasil yang diharapkan |
| --- | --- | --- |
| 1 | Pengguna A mencoba mengubah `role` miliknya jadi admin lewat API | Ditolak (tidak ada hak kolom) |
| 2 | Pengguna A insert post dengan `score = 999` atau `is_hidden = false` manual | Ditolak (hak insert per kolom) |
| 3 | Pengguna A insert post dengan `author_id` milik B | Ditolak oleh RLS |
| 4 | Pengguna A membaca tabel `posts` langsung untuk melihat penulis post anonim | Hanya melihat post miliknya sendiri |
| 5 | Pengguna biasa memanggil `mod_apply_action` | `FORBIDDEN` |
| 6 | Moderator mencoba menindak admin | `FORBIDDEN` |
| 7 | Pengguna biasa membaca `invite_codes` atau `mod_actions` | Kosong atau ditolak |
| 8 | Pengguna banned/suspend mencoba posting, komentar, vote, upload | Semua ditolak |
| 9 | Akun berumur kurang dari 24 jam mengunggah foto | Ditolak |
| 10 | Mengunggah ke folder pengguna lain di storage | Ditolak |
| 11 | Mengunggah file bukan gambar atau di atas 1 MB ke bucket | Ditolak |
| 12 | Mengirim 6 post dalam 1 jam dari akun baru | Post keenam kena `RATE_LIMIT` |
| 13 | Memakai kode undangan yang sudah habis | `INVITE_INVALID` |
| 14 | Menyisipkan `<script>` di judul/isi/komentar | Tampil sebagai teks biasa, tidak dieksekusi |
| 15 | Memakai kunci anon untuk mengakses data tanpa login | Ditolak |

### 26.2 Uji fungsional

1. Jalankan seluruh poin kriteria selesai di bagian 18 sebagai daftar centang.
2. Uji alur akun lengkap di bagian 19 (daftar, verifikasi, lupa password, hapus akun).
3. Uji dua akun bersamaan: A posting, B komentar, A membalas, keduanya vote, B melaporkan.
4. Uji tiga akun melaporkan satu post, pastikan auto-hide bekerja, lalu moderator menolak laporan dan post tampil kembali.

### 26.3 Uji perangkat dan performa

1. Android (Chrome), iPhone (Safari), dan satu browser desktop.
2. Jaringan lambat (throttling 3G): feed tetap bisa dibaca, foto lazy-load.
3. Foto mentah 8–10 MB dari kamera HP: hasil kompres di bawah 1 MB dan terlihat layak.
4. Isi seed 500 post dan 3.000 komentar, lalu ukur waktu muat feed dan detail post. Target di bawah 2 detik.

## 27. Daftar Periksa Peluncuran

**Teknis**

- [ ] Semua SQL (bagian 8, 16, 17) berhasil dijalankan tanpa error
- [ ] RLS aktif di semua tabel (cek di dashboard Supabase)
- [ ] Semua uji keamanan bagian 26.1 lulus
- [ ] SMTP kustom terpasang dan email verifikasi sampai ke inbox
- [ ] Domain tersambung, HTTPS aktif
- [ ] Environment variable terisi, kunci service role tidak ada di kode klien
- [ ] Cron pembersihan berjalan
- [ ] Rencana cadangan database ditetapkan

**Isi dan operasional**

- [ ] Aturan komunitas, Syarat & Ketentuan, dan Kebijakan Privasi tayang dan ditautkan di footer dan form daftar
- [ ] Komunitas awal dibuat
- [ ] Minimal 2 moderator siap
- [ ] Prosedur penanganan konten berbahaya disepakati
- [ ] 10–20 post awal sudah ada agar feed tidak kosong
- [ ] Kode undangan untuk 20–30 penguji sudah dibuat

**Hukum**

- [ ] Cek kewajiban pendaftaran Penyelenggara Sistem Elektronik (PSE) sebelum membuka untuk umum
- [ ] Siapkan kontak resmi untuk laporan dan banding

## 28. Draf Aturan dan Dokumen Hukum (Perlu Ditinjau)

Catatan: draf ini hanya titik awal, bukan nasihat hukum. Mintalah tinjauan dari orang yang paham hukum sebelum dibuka untuk umum.

### 28.1 Aturan komunitas (siap pakai, singkat)

1. Ngobrol bebas, termasuk bahasa kasar dan opini keras, selama tidak melanggar aturan di bawah.
2. Dilarang konten porno atau seksual eksplisit.
3. Dilarang segala konten yang melibatkan anak di bawah umur secara seksual. Pelanggaran langsung diblokir permanen dan dapat dilaporkan ke pihak berwenang.
4. Dilarang ancaman, ajakan kekerasan, dan ujaran kebencian yang memicu kekerasan.
5. Dilarang menyebarkan data pribadi orang lain (alamat, nomor telepon, foto pribadi tanpa izin).
6. Dilarang spam, penipuan, dan promosi berlebihan.
7. Dilarang konten yang melanggar hukum Indonesia.
8. Keputusan moderator bersifat final. Banding bisa diajukan lewat email kontak.

### 28.2 Garis besar Syarat & Ketentuan

- Pengguna minimal berusia 17 tahun (atau usia yang kamu tetapkan).
- Pengguna bertanggung jawab atas konten yang diunggah dan menjamin memiliki haknya.
- Pengguna memberi platform lisensi non-eksklusif untuk menampilkan konten di dalam layanan.
- Platform berhak menghapus konten dan menonaktifkan akun yang melanggar tanpa pemberitahuan sebelumnya.
- Layanan disediakan apa adanya, tanpa jaminan ketersediaan.
- Posting anonim hanya anonim bagi pengguna lain, bukan bagi pengelola. Pengelola dapat melihat identitas penulis untuk keperluan moderasi dan permintaan sah dari pihak berwenang.
- Hukum yang berlaku adalah hukum Republik Indonesia.

### 28.3 Garis besar Kebijakan Privasi

| Hal | Isi |
| --- | --- |
| Data yang dikumpulkan | Email, username, password (disimpan sebagai hash oleh Supabase), konten yang diunggah, catatan aktivitas teknis |
| Tujuan | Menjalankan layanan, keamanan, dan moderasi |
| Penyimpanan | Pada penyedia infrastruktur (Supabase, Vercel). Sebutkan lokasi servernya bila diketahui |
| Berbagi data | Tidak dijual. Dapat diberikan ke pihak berwenang sesuai hukum |
| Hak pengguna | Mengubah profil dan menghapus akun beserta kontennya |
| Foto | Metadata lokasi (EXIF) dihapus saat unggah |
| Kontak | Alamat email pengelola |

## 29. Urutan Prompt untuk AI Coding (GLM)

Bangun bertahap. Setiap langkah punya hasil yang bisa diperiksa sebelum lanjut, supaya token tidak habis untuk memperbaiki hal yang berantakan. Berikan PRD ini sebagai konteks di awal.

| Langkah | Perintah ke AI | Cara memeriksa |
| --- | --- | --- |
| 1 | Buat proyek Next.js (App Router, TypeScript, Tailwind), pasang klien Supabase (browser dan server) dan middleware sesi, sesuai struktur bagian 23.1 | App jalan di localhost, tanpa error |
| 2 | Jalankan SQL bagian 8, 16, 17 sebagai file migrasi berurutan | Tabel muncul, RLS aktif |
| 3 | Buat halaman daftar, login, lupa password, dan penanganan kode error (peta di bagian 20) | Daftar dengan kode undangan berhasil, kode salah ditolak |
| 4 | Buat komponen dasar (tombol, input, kartu, dialog, toast, skeleton) dan layout dengan navigasi bawah | Tampil rapi di lebar 375 px |
| 5 | Buat feed (`get_feed`), halaman komunitas, gabung/keluar komunitas | Feed memuat, urutan terbaru/populer berjalan |
| 6 | Buat form post tanpa foto, halaman detail post, edit, hapus | Kriteria 18.3 poin 1, 2, 7, 8 lulus |
| 7 | Buat komentar bertingkat dan vote (optimistic update) | Kriteria 18.4 dan 18.5 lulus |
| 8 | Tambahkan kompres dan upload foto (bagian 25) | Kriteria 18.7 lulus, ukuran hasil di bawah 1 MB |
| 9 | Buat tombol laporan dan dashboard admin (antrean, tindakan, log, undangan, komunitas) | Kriteria 18.6 lulus |
| 10 | Buat profil, pengaturan, halaman legal (bagian 28), dan banner status akun | Kriteria 18.1 poin 6 dan 7 lulus |
| 11 | Jalankan semua uji keamanan (bagian 26.1), perbaiki temuan | Semua lulus |
| 12 | Buat cron pembersihan, deploy ke Vercel, sambungkan domain | Daftar periksa bagian 27 terpenuhi |

**Tips hemat token**

1. Selalu sebut nomor bagian PRD yang relevan alih-alih menempelkan ulang seluruh dokumen.
2. Minta AI mengerjakan **satu langkah** per percakapan, lalu uji sebelum lanjut.
3. Saat ada bug, tempelkan pesan error lengkap dan hanya file yang terkait.
4. Simpan SQL sebagai file migrasi di repo supaya tidak perlu dibuat ulang.
5. Commit ke Git setelah tiap langkah lulus, agar mudah kembali bila AI merusak sesuatu.
