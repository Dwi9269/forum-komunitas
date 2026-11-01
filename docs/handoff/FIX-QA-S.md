# FIX-QA-S — Perbaikan Pasca-Audit QA-AGENT (temuan S + R sepele)

Agent perbaikan pasca-audit — 2026-11-01.
Sumber temuan: `docs/QA_REPORT.md` (audit 2026-11-01). `npm run build` TIDAK dijalankan
(hanya orkestrator yang build) — seluruh perubahan menjaga kontrak tipe file yang disentuh.

## Ringkasan

| Kode | Status | Ringkas |
|---|---|---|
| S-1 | DIPERBAIKI | Beranda: login → feed hanya komunitas diikuti + ajakan gabung; tamu → ajakan masuk/daftar |
| S-2 | DIPERBAIKI | memberCount/postCount dari view `community_stats`; "1,2 rb anggota" tampil di /c/[slug] |
| S-3 | DIPERBAIKI | Gate foto <24 jam disambungkan: tombol foto nonaktif + alasan tampil proaktif di /submit |
| S-4 | TIDAK DIKODE (di luar kepemilikan) | Milik DB-AGENT (supabase/migrations) + keputusan konfigurasi "Confirm email" — lihat catatan |
| R-10 | DIPERBAIKI | avatar_url kini wajib file di folder user sendiri |
| R-6/7/8/9/11/12 | SENGAJA TIDAK DIPERBAIKI | Bukan sepele / di luar kepemilikan — lihat daftar di bawah |

File yang diubah (semua di dalam batas kepemilikan yang diizinkan):

- `app/(main)/page.tsx`
- `app/(main)/c/[slug]/page.tsx`
- `app/(main)/submit/page.tsx`
- `components/feed/FeedList.tsx`
- `components/feed/server-data.ts`
- `components/feed/types.ts`
- `lib/actions/communities.ts`
- `lib/actions/auth.ts`
- `lib/actions/images.ts`
- `lib/actions/profiles.ts`

Tidak ada file di supabase/**, app/admin/**, components/admin/**, lib/image/**, docs/QA_REPORT.md,
docs/PROGRESS.md, .env* yang disentuh.

---

## S-1. Beranda hanya post komunitas yang diikuti (PRD 18.2.1)

File: `app/(main)/page.tsx`, `components/feed/FeedList.tsx`, `components/feed/server-data.ts`.

Perubahan:

1. `server-data.ts` — `ArgumenFeed` kini punya `onlyJoined?: boolean` (diteruskan ke `getFeed`).
2. `page.tsx` — sesi dibaca dulu (`ambilSesi`):
   - **Pengguna login** → `ambilFeed({ sort, onlyJoined: true })` — feed HANYA komunitas
     yang diikuti (PRD 18.2.1). `onlyJoined: true` juga dikirim ke `FeedList` agar pagination
     "Muat lagi" di klien mengirim ulang filter yang sama (sebelumnya halaman berikutnya
     menampilkan SEMUA post — celah yang dicatat QA).
   - **Feed kosong untuk pengguna login** → halaman memuat `getCommunities()` dan membedakan:
     belum mengikuti satu pun → kartu ajakan "Ikuti komunitas untuk mengisi feed-mu"
     (daftar hingga 6 komunitas, masing-masing dengan tombol `JoinButton` Gabung + tautan
     ke /c/[slug]); sudah mengikuti tetapi belum ada post → EmptyState "Feed-mu masih kosong"
     dengan petunjuk mengikuti komunitas.
   - **Tamu (belum login)** → `ambilFeed({ sort })` TANPA `onlyJoined` (browsing publik).
3. `FeedList.tsx` — prop baru `onlyJoined?: boolean`, ikut dikirim pada `getFeed` saat
   "Muat lagi"/retry (konsistensi filter antar halaman pagination).

**KEPUTUSAN PRODUK (dicatat untuk orkestrator/QA):** untuk TAMU ditetapkan "browsing publik"
= beranda memanggil feed tanpa `onlyJoined`. Namun database (dengan sengaja, uji keamanan
PRD 26.1 #15 berstatus LULUS) mencabut SELECT view/RPC dari anon, sehingga tamu menerima
`LOGIN_REQUIRED`. Daripada melemahkan keamanan (service-role/env baru dilarang), tamu
ditampilkan EmptyState "Masuk untuk melihat feed" dengan tombol Masuk/Daftar. Bila kelak DB
mengizinkan baca publik, jalur tamu yang sama otomatis menampilkan semua post tanpa ubah kode.

Cara memeriksa:
- Login akun yang mengikuti ≥1 komunitas → beranda hanya menampilkan post komunitas diikuti;
  klik "Muat lagi" → post berikutnya juga masih dari komunitas yang diikuti.
- Login akun yang TIDAK mengikuti apa pun → kartu ajakan komunitas + tombol Gabung; gabung
  satu komunitas lalu refresh → post komunitas itu tampil.
- Logout → beranda menampilkan ajakan Masuk/Daftar (bukan error, bukan daftar post).

## S-2. Jumlah anggota komunitas tampil di /c/[slug] (PRD 18.2.3)

File: `lib/actions/communities.ts`, `app/(main)/c/[slug]/page.tsx`, `components/feed/types.ts`.

Perubahan:

1. `communities.ts` — helper `fetchCommunityStats(supabase, ids?)` membaca view
   `community_stats` (migrasi 0005; kolom persis `community_id, member_count, post_count`,
   grant ke authenticated) SEKALI lalu mengembalikan `Map` by id — bukan query per komunitas.
   - `getCommunities()` memuat stats dalam `Promise.all` yang sama (satu bacaan untuk semua
     komunitas) dan mengisi `memberCount`/`postCount` per komunitas.
   - `getCommunityBySlug()` memuat stats untuk satu id (`fetchCommunityStats(supabase, [row.id])`).
   - Gagal membaca view (RLS/jaringan) → angka jatuh ke `null` (UI menyembunyikan angka),
     permintaan TIDAK gagal — perilaku aman seperti sebelumnya.
   - Komentar lama "FASE1-DB: tidak ada view statistik" diperbarui.
2. `types.ts` — `formatAngkaRingkas(n)`: `Intl.NumberFormat("id-ID", { notation: "compact" })`
   → 12 = "12", 1200 = "1,2 rb", 250000 = "250 rb"; fallback `toLocaleString("id-ID")`.
3. `c/[slug]/page.tsx` — header komunitas menampilkan `• {formatAngkaRingkas(memberCount)} anggota`
   (angka disembunyikan bila masih null).

Cara memeriksa: login → buka `/c/umum` → di bawah slug tampil "N anggota" (komunitas besar
tampil ringkas, mis. "1,2 rb anggota"); gabung/keluar → angka berubah setelah refresh;
daftar komunitas di /submit juga kini menerima angka (kontrak terisi, tidak mengubah tampilan).

## S-3. Tombol foto nonaktif proaktif untuk akun <24 jam (PRD 18.3.10 / 4.7)

File: `lib/actions/auth.ts`, `lib/actions/images.ts`, `app/(main)/submit/page.tsx`.

Perubahan:

1. `auth.ts` — `SessionProfile` bertambah `createdAt: string | null` (ISO
   `profiles.created_at`); dibaca di `fetchProfileRow` (`select` + `created_at`) dan dipetakan
   di `toSessionProfile`. Pengecekan pemakai: `SessionProfile` hanya dikonsumsi sebagai tipe
   (`server-data.ts` ambilSesi, `admin.ts` guardRole) — penambahan field aman, tidak ada
   pembuatan objek literal `SessionProfile` manual.
2. `images.ts` — aksi baru `getImageUploadGate(): Promise<ImageUploadGate>`:
   `{ allowed, reason }` dihitung server-side dari umur akun (`createdAt` vs 24 jam) —
   TIDAK lewat RPC (can_upload memang tidak diekspos sebagai RPC; DB tetap penjaga akhir di
   policy storage). Keputusan konservatif: akun suspend/ban → `allowed:false, reason:null`
   (form utama sudah nonaktif dengan alasan status); `createdAt` gagal dibaca/tak valid →
   `allowed:true` (jangan mengunci pengguna karena kegagalan baca — upload sungguhan tetap
   ditolak DB dan pesan PESAN_AKUN_BARU_24JAM muncul lewat jalur error lama).
3. `submit/page.tsx` — memanggil `getImageUploadGate()` (di-catch → gate terbuka bila melempar)
   dan meneruskan `alasanFotoNonaktif` ke `SubmitPostForm` (prop sudah disiapkan: pemilih foto
   diganti pesan peringatan "Foto belum bisa diunggah: akun baru dapat mengunggah foto setelah
   berumur 24 jam. Kamu masih bisa mengirim post tanpa foto." — Kirim tanpa foto tetap bisa).

Cara memeriksa: daftar akun baru → buka /submit → sektion Foto menampilkan peringatan kuning
(bukan pemilih foto) SEBELUM mencoba; kirim post tanpa foto tetap sukses. Akun >24 jam →
pemilih foto normal. Setelah 24 jam akun baru → pemilih foto aktif (uji manual M6 QA tetap
berlaku untuk penegakan di sisi storage).

## S-4. Verifikasi email tidak dijaga di DB — TIDAK DIKODE (di luar kepemilikan)

Temuan ini milik DB-AGENT (`supabase/migrations` — dilarang disentuh agent ini) plus keputusan
konfigurasi panel oleh orkestrator/user ("Confirm email" ON). Tidak ada perubahan kode app yang
mampu menutup temuan ini sendirian; jalur app sudah memilih arah aman (login sebelum verifikasi
ditolak EMAIL_NOT_CONFIRMED bila konfigurasi ON). Tetap terbuka — selesaikan lewat migrasi DB
(is_active_user memeriksa email confirmation) + uji manual M2 dari QA_REPORT.

## Temuan R

### Diperbaiki

- **R-10** — `lib/actions/profiles.ts`: `isAvatarBucketUrl(value, userId)` kini mewajibkan
  segmen setelah `/object/public/avatars/` diawali folder user sesi (`{user_id}/{file}` dengan
  nama file non-kosong; path di-decode dengan aman). URL avatar milik pengguna lain kini
  ditolak `AVATAR_INVALID`. Alur sah tidak rusak: `uploadAvatar` (lib/image/upload.ts) selalu
  menghasilkan URL `/object/public/avatars/{user.id}/…`. Cara memeriksa: coba `updateProfile`
  dengan URL avatar folder user lain → gagal AVATAR_INVALID; unggah avatar sendiri di /settings
  → tetap sukses.

### Sengaja TIDAK diperbaiki (bukan sepele / di luar kepemilikan)

- **R-6** (pesan RATE_LIMIT tanpa sisa waktu) — sisa waktu hanya diketahui DB; solusi benar
  butuh informasi dari trigger/RPC (milik DB-AGENT), bukan sekadar teks.
- **R-7** (race condition rate limit) — perbaikannya di trigger DB (`supabase/**` dilarang).
- **R-8** (banner banned tanpa alasan/email banding) — butuh nilai env baru (`.env*` dilarang)
  + keputusan sumber appealEmail + jalur aman menampilkan alasan mod_actions; lintas agent.
- **R-9** (profil pengguna lain: bio/avatar/komentar) — butuh kontrak baca backend baru
  (getComments per user) + perubahan halaman; bukan kerja <10 menit.
- **R-11** (kode undangan hardcode di RegisterForm; kedalaman balasan UI≠DB) — butuh sumber
  kebenaran app_settings dari server dan penyelarasan kontrak UI/DB; menyentuh perilaku
  registrasi/komentar — bukan perbaikan sepele, risiko regresi.
- **R-12** (PROGRESS.md tidak sinkron; artefak Fase 6) — PROGRESS.md milik orkestrator
  (dilarang); artefak Fase 6 (vercel.json, cron, DEPLOY.md) scope DEVOPS.

## Catatan untuk orkestrator

- `npm run build` sengaja tidak dijalankan (sesi instruksi); mohon jalankan build + uji ulang QA
  (khususnya verifikasi S-1/S-2/S-3 di atas dan uji manual M2/M6).
- Tidak ada kontrak aksi yang diubah secara breaking: semua perubahan bersifat aditif
  (`ArgumenFeed.onlyJoined`, `FeedListProps.onlyJoined`, `SessionProfile.createdAt`,
  `getImageUploadGate`, `formatAngkaRingkas`, isi `memberCount/postCount` kini terisi).
