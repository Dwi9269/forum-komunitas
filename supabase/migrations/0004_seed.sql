-- ============================================================
-- 0004_seed.sql
-- Forum Komunitas (MVP) — data awal
-- Sumber: docs/PRD.md 16.1 (app_settings) dan catatan implementasi
-- ("Buat komunitas awal: Umum, Curhat, Jual-Beli, Teknologi, Hobi").
-- Jalankan SETELAH 0001-0003.
--
-- Tidak ada seed lain: kode undangan dibuat admin lewat dashboard/RPC
-- (lihat komentar di 0002), data komunitas lain dibuat admin dari /admin.
-- ============================================================

-- Pengaturan aplikasi (dipindah dari PRD 16.1):
-- pendaftaran berikutnya wajib kode undangan.
insert into app_settings (key, value) values ('invite_required', 'true'::jsonb)
on conflict (key) do nothing;

-- Komunitas awal sesuai PRD. Slug mengikuti aturan PRD (huruf kecil, angka,
-- tanda hubung); deskripsi dipilih sebagai placeholder yang aman.
insert into communities (slug, name, description) values
  ('umum',       'Umum',       'Diskusi bebas seputar apa saja.'),
  ('curhat',     'Curhat',     'Ruang berbagi cerita dan saling mendukung.'),
  ('jual-beli',  'Jual-Beli',  'Perdagangan antar anggota komunitas.'),
  ('teknologi',  'Teknologi',  'Obrolan seputar teknologi, gadget, dan internet.'),
  ('hobi',       'Hobi',       'Komunitas sesuai minat dan kegemaran.')
on conflict (slug) do nothing;
