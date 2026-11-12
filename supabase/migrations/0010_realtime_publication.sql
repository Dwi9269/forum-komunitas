-- ============================================================
-- 0010_realtime_publication.sql
-- Daftarkan tabel notifications ke publication supabase_realtime agar
-- event INSERT/UPDATE diterima klien (postgres_changes) untuk lonceng
-- realtime. Tanpa ini, event realtime tidak di-broadcast.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
