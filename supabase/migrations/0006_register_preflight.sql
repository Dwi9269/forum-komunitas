-- ============================================================
-- 0006_register_preflight.sql
-- Fungsi pra-periksa pendaftaran (hotfix UX 2026-11-02).
--
-- Latar: GoTrue kadang menyamarkan error trigger handle_new_user menjadi
-- pesan generik ("Database error saving new user"), sehingga user hanya
-- melihat "Terjadi kesalahan. Coba lagi." padahal penyebabnya spesifik
-- (kode undangan salah / username dipakai). Fungsi ini mengecek hal yang
-- sama dengan trigger SEBELUM signUp, sehingga aksi register bisa
-- mengembalikan kode error yang tepat. Trigger DB tetap penjaga akhir.
--
-- Returns: NULL = boleh lanjut; selain itu kode error (teks).
-- ============================================================

create or replace function public.check_register_allowed(p_username text, p_code text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_required boolean := coalesce(
    (select (value)::boolean from app_settings where key = 'invite_required'), true);
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if p_username is null or p_username !~ '^[a-zA-Z0-9_]{3,20}$' then
    return 'USERNAME_INVALID';
  end if;

  -- Pencocokan case-insensitive: mencegah lookalike "admin" vs "Admin"
  -- yang menyulitkan moderasi (constraint unique di profiles lebih longgar).
  if exists (select 1 from profiles where lower(username) = lower(trim(p_username))) then
    return 'USERNAME_TAKEN';
  end if;

  if v_required then
    -- Pendaftar pertama bebas kode (semantik yang sama dengan trigger).
    if not exists (select 1 from profiles) then
      return null;
    end if;
    if not exists (
      select 1 from invite_codes
      where code = v_code
        and used_count < max_uses
        and (expires_at is null or expires_at > now())
    ) then
      return 'INVITE_INVALID';
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function public.check_register_allowed(text, text) from public, anon;
grant execute on function public.check_register_allowed(text, text) to anon, authenticated;
