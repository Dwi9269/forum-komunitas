-- ============================================================
-- 0005_community_stats.sql
-- Forum Komunitas (MVP) — FASE 4: statistik komunitas
-- Sumber: docs/PRD.md 18.2.3 (halaman /c/[slug] menampilkan jumlah
-- anggota) + instruksi orkestrator FASE 4. RPC moderasi (16.6)
-- dicek terhadap PRD — hasilnya di bagian 3 bawah (tidak ada perubahan).
-- Jalankan SETELAH 0001-0004. Idempoten: create or replace view.
-- ============================================================

-- ============================================================
-- 1. View public.community_stats
-- Nama kolom PERSIS: community_id, member_count, post_count.
--   member_count = jumlah baris community_members komunitas itu
--                  (gabung/keluar menambah/menghapus baris — PRD 18.2.2).
--   post_count   = jumlah post yang TIDAK is_deleted DAN TIDAK is_hidden
--                  (instruksi orkestrator FASE 4).
-- security_invoker = false (definer) disengaja — alasan sama dengan
-- posts_feed/comments_view di 0002: RLS community_members hanya
-- memperlihatkan baris sendiri dan RLS posts hanya penulis/moderator,
-- sedangkan angka statistik harus terbaca oleh SEMUA authenticated.
-- JANGAN diubah ke security_invoker = true.
-- View memuat semua komunitas; yang belum punya anggota/post tampil 0.
-- ============================================================

create or replace view public.community_stats
with (security_invoker = false) as
select
  c.id as community_id,
  (select count(*) from community_members m
    where m.community_id = c.id) as member_count,
  (select count(*) from posts p
    where p.community_id = c.id
      and p.is_deleted = false
      and p.is_hidden = false) as post_count
from communities c;

-- create or replace view tidak menimpa opsi view yang sudah ada; baris ini
-- menjamin opsi tetap definer sekalipun view sempat dibuat manual saat uji.
alter view public.community_stats set (security_invoker = false);

-- ============================================================
-- 2. Hak akses — pola yang sama dengan posts_feed/comments_view
--    (grant di 0002, revoke anon di 0003)
-- ============================================================
grant select on public.community_stats to authenticated;

-- PENGUATAN: default privilege Supabase otomatis memberi grant SELECT ke
-- anon untuk objek baru di schema public; PRD hanya mengizinkan
-- authenticated (akses via undangan), maka dicabut.
revoke select on public.community_stats from anon;

-- ============================================================
-- 3. RPC moderasi target 'user' — HASIL PENGECEKAN: TIDAK ADA PERUBAHAN
-- PRD 16.6 (docs/PRD.md baris 582-665) dan implementasi live
-- public.mod_apply_action di supabase/migrations/0002_functions_triggers.sql
-- (baris 258-316) SUDAH mendukung p_target_type = 'user' sepenuhnya:
--   - 'user' diterima sebagai target (v_user := p_target_id); aksi
--     hide/delete terhadap user ditolak dengan exception ACTION_INVALID.
--   - 'suspend'  -> profiles.status='suspended',
--                  suspended_until = now() + make_interval(days => p_days)
--                  (durasi p_days dipakai — cocok PRD 18.6.5: 1/3/7/30 hari).
--   - 'ban'      -> profiles.status='banned', suspended_until = null.
--   - 'restore'  -> reaktivasi akun: profiles.status='active',
--                  suspended_until = null (jalur else di cabang restore).
--   - Moderator tidak bisa menindak admin (cek is_admin) — PRD 18.6.6.
--   - Setiap aksi selalu dicatat ke mod_actions (insert di akhir fungsi).
-- Kesimpulan: tidak perlu fungsi/RPC tambahan di 0005. Backend memanggil
-- mod_apply_action(p_action, p_target_type, p_target_id, p_reason, p_days)
-- yang sudah live sejak 0002. Bagian ini hanya komentar — aman dijalankan.
-- ============================================================
