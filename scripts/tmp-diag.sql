begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select auth.uid() as uid_aktif, public.is_active_user() as user_aktif, current_user as peran_db;
rollback;
