-- ============================================================
-- 0007_protect_moderation_flags.sql
-- Hotfix keamanan: penulis tidak boleh membatalkan penghapusan.
--
-- Latar: penulis punya hak update kolom is_deleted (untuk "hapus milik
-- sendiri") dan lolos policy posts_update_own / comments_update_own.
-- Akibatnya penulis bisa mengirim update is_deleted = false lewat API
-- Supabase dan memunculkan kembali konten yang dihapus moderator
-- (mod_apply_action 'delete').
--
-- Perbaikan: trigger BEFORE UPDATE menolak perubahan is_deleted dari
-- true menjadi false, kecuali oleh moderator/admin aktif. RPC
-- mod_apply_action ('restore') tetap berfungsi karena auth.uid() di
-- dalam fungsi security definer tetap milik pemanggil (moderator).
-- Pemanggil tanpa auth.uid() (service role / SQL editor) tidak dibatasi.
--
-- Hanya menambah fungsi + trigger; tidak mengubah data. Jangan memakai
-- BEGIN/COMMIT di sini: runner migrasi sudah membungkus dalam transaksi.
-- ============================================================

create or replace function public.protect_is_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_deleted = true and new.is_deleted = false
     and auth.uid() is not null
     and not public.is_moderator() then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;

drop trigger if exists posts_protect_is_deleted on posts;
create trigger posts_protect_is_deleted
  before update of is_deleted on posts
  for each row execute function public.protect_is_deleted();

drop trigger if exists comments_protect_is_deleted on comments;
create trigger comments_protect_is_deleted
  before update of is_deleted on comments
  for each row execute function public.protect_is_deleted();
