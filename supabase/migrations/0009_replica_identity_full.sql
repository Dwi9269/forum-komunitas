-- ============================================================
-- 0009_replica_identity_full.sql
-- Melengkapi fitur notifikasi realtime (lonceng): dengan replica identity
-- full, event UPDATE dari Supabase Realtime membawa baris lama lengkap —
-- dipakai NotificationBell untuk menurunkan badge saat notifikasi ditandai
-- dibaca, tanpa perlu refresh halaman.
-- ============================================================

alter table public.notifications replica identity full;
