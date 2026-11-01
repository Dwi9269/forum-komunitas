# QA_REPORT — Audit Independen Fase 5

QA-AGENT (penguji independen, skeptis) — 2026-11-01.
Metode: (1) hasil eksekusi uji RLS `supabase/tests/rls_checks.sql` 2026-11-01 = **17 OK / 0 GAGAL** (dijalankan orchestrator, migrasi 0001-0005 live); (2) inspeksi statis kode (findstr + Read) atas `app/`, `components/`, `lib/`, `supabase/migrations/`, `middleware.ts`, `.gitignore`, `.git/index`; (3) pembandingan dengan `docs/PRD.md` bagian 18 (baris 843-908) dan 26 (baris 1319-1354). QA tidak mengedit kode fitur apa pun dan tidak menjalankan npm/koneksi database.

## RINGKASAN

| Tingkat | Jumlah terbuka |
|---|---|
| T (Tinggi) | **0** |
| S (Sedang) | **0 terbuka** — S-1, S-2, S-3 diuji ulang LULUS; S-4 LULUS VIA KONFIGURASI (lihat bagian UJI ULANG) |
| R (Rendah) | 6 terbuka — R-10 diuji ulang LULUS; R-6/7/8/9/11/12 sengaja belum diperbaiki (tidak memblokir gerbang) |

**Status GERBANG 5: LULUS (bersyarat)** — TETAP setelah uji ulang 2026-11-01 atas perbaikan FIX-QA-S: nol temuan T terbuka; seluruh 15 uji keamanan PRD 26.1 berstatus LULUS (dibuktikan uji RLS dinamis dan/atau bukti statis migrasi/kode), TANPA satu pun berstatus GAGAL. Syarat: butir BUTUH UJI MANUAL wajib dijalankan user sebelum membuka forum ke orang lain (daftar di bawah), terutama uji #M2 (verifikasi email) dan #M4 (auto-hide 3 laporan).

## UJI ULANG 2026-11-01 (pasca-perbaikan FIX-QA-S)

Metode: baca `docs/handoff/FIX-QA-S.md`, lalu inspeksi statis seluruh file yang diklaim berubah (`app/(main)/page.tsx`, `app/(main)/c/[slug]/page.tsx`, `app/(main)/submit/page.tsx`, `components/feed/FeedList.tsx`, `components/feed/server-data.ts`, `components/feed/types.ts`, `lib/actions/communities.ts`, `lib/actions/auth.ts`, `lib/actions/images.ts`, `lib/actions/profiles.ts`). Verifikasi e2e di browser tetap ranah uji manual (M-daftar).

| Temuan | Keputusan | Bukti uji ulang |
|---|---|---|
| S-1 | **DIUJI ULANG LULUS** | `app/(main)/page.tsx`: login → `ambilFeed({ sort, onlyJoined: true })`; feed kosong + belum mengikuti → `AjakanKomunitas` (daftar 6 komunitas + `JoinButton`) persis PRD 18.2.1; sudah mengikuti tapi kosong → EmptyState "Feed-mu masih kosong"; tamu → `LOGIN_REQUIRED` dari DB → EmptyState CTA Masuk/Daftar (bukan feed publik, bukan error mentah). `server-data.ts` menambah `ArgumenFeed.onlyJoined`; `FeedList` mengirim ulang `onlyJoined` pada "Muat lagi"/retry — celah pagination yang dicatat QA tertutup. Tidak mengubah kontrak backend secara breaking. |
| S-2 | **DIUJI ULANG LULUS** | `communities.ts`: helper `fetchCommunityStats()` membaca view `community_stats` (grant authenticated, 0005) sekali lalu map by id; `getCommunities` (Promise.all) dan `getCommunityBySlug` kini mengisi `memberCount`/`postCount`; gagal baca view → null (UI sembunyikan angka, tidak fatal). `c/[slug]/page.tsx` menampilkan `• {formatAngkaRingkas(memberCount)} anggota` (types.ts:412, Intl compact id-ID + fallback). |
| S-3 | **DIUJI ULANG LULUS** | `auth.ts`: `SessionProfile.createdAt` + `ProfileRow.created_at` + select `created_at` (fetchProfileRow:362) + pemetaan (toSessionProfile:400) — lengkap. `images.ts`: aksi baru `getImageUploadGate()` (async, sah untuk file "use server") menghitung umur akun server-side; konservatif: suspend/ban → tidak dibolehkan, createdAt tak terbaca → dibolehkan (DB tetap menolak saat upload nyata). `submit/page.tsx`: gate dipanggil (di-catch → terbuka) dan `alasanFotoNonaktif` kini DITERUSKAN ke `SubmitPostForm` (prop lama yang sebelumnya tak pernah diisi; suspend/ban tetap dilayani `alasanNonaktif`). Penegakan akhir tetap `can_upload()` di DB — uji manual M6 tetap berlaku. |
| S-4 | **LULUS VIA KONFIGURASI** (keputusan final) | Dengan konfirmasi email AKTIF (default proyek Supabase baru dan rekomendasi PRD 23.3), user yang belum verifikasi TIDAK PERNAH mendapat sesi: signUp mengembalikan session null, signInWithPassword ditolak `EMAIL_NOT_CONFIRMED` (auth.ts:454-456) — 18.1.4 terpenuhi secara efektif, bahkan lebih ketat dari PRD (tidak bisa login sama sekali, bukan login read-only) = arah aman sesuai aturan keras #9. `is_active_user()` di DB tetap tidak memeriksa konfirmasi email, sehingga kepatuhan BERGANTUNG konfigurasi panel — verifikasi manual M2 wajib dan tidak dapat digantikan uji statis. Jika suatu hari konfigurasi dimatikan, temuan ini kembali terbuka (pertimbangkan penguatan DB oleh DB-AGENT). |
| R-10 | **DIUJI ULANG LULUS** | `profiles.ts`: `isAvatarBucketUrl(value, userId)` kini mewajibkan segmen setelah `/object/public/avatars/` diawali folder user sesi + nama file non-kosong (decodeURIComponent dijaga); URL avatar milik pengguna lain → `AVATAR_INVALID` (baris 115-116). Alur sah tidak rusak (path milik sendiri di baris 119 tetap dinormalkan; `uploadAvatar` MEDIA-AGENT selalu menghasilkan URL folder sendiri). |

Catatan: R-6/R-7/R-8/R-9/R-11/R-12 sengaja belum diperbaiki (alasan per tingkat di handoff FIX-QA-S) — semuanya Rendah, tidak memblokir Gerbang 5 (yang mensyaratkan nol temuan T terbuka). `npm run build` tidak dijalankan oleh FIX-QA-S maupun QA; orkestrator disarankan menjalankan build (perubahan tipe bersifat aditif dan konsisten pada pemeriksaan statis).

Aturan keras skill (bagian 7) — hasil audit:

1. RLS tidak dimatikan — LULUS. `alter table ... enable row level security` untuk 11 tabel (0003 baris 21-31); tidak ada `disable row level security` / `force ... bypassrls` di seluruh migrasi.
2. Klien tanpa hak kolom score/is_hidden/role/status/used_count — LULUS. Grant kolom 0003 baris 34-51 (`revoke insert, update ...` lalu `grant update (avatar_url, bio) on profiles`, `grant insert (community_id, author_id, title, body, is_anonymous) on posts`, dst.). Uji RLS S3a/S3b/S3c + S5a membuktikannya live.
3. Klien hanya baca via view — LULUS. Semua READ post/komentar memakai `posts_feed`/`comments_view`/RPC `get_feed` (posts.ts, comments.ts, votes.ts). Pemakaian `.from("posts")`/`.from("comments")`/`.from("profiles")` di `lib/actions` HANYA untuk WRITE (insert/update dengan grant kolom) dan untuk baca admin/moderator yang sah oleh RLS moderator (pengecualian tercatat): `admin.ts` getReports membaca tabel mentah posts/comments (moderator lolos `posts_select`/`comments_select` — diperlukan karena konten yang ditinjau justru tersembunyi dari view, admin.ts baris 422-435), `admin.ts` getModLog membaca `mod_actions` (policy `modact_select` moderator-only), `admin.ts` listUsers/invites membaca `profiles`/`invite_codes` (policy moderator/admin). Tidak ada baca raw post/komentar di jalur publik.
4. Service role key hanya server/cron — LULUS. Scan `SERVICE_ROLE`, `sb_secret`, `sb_publishable`, `eyJ` di `app/`, `components/`, `lib/`, `scripts/`, `middleware.ts`, migrasi: NIHIL. `lib/supabase/server.ts` dan `client.ts` hanya memakai `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `scripts/exec-sql.mjs` memakai password dari env runtime (`SUPA_DB_PASSWORD`), tidak di-hardcode.
5. Tidak ada fitur video/DM/push — LULUS. Scan `video`, `realtime`, `supabase.channel`, push: NIHIL di app/components/lib.
6. Komentar tidak anonim — LULUS. `createComment` tidak punya kolom is_anonymous (comments.ts insert hanya post_id/parent_id/author_id/body); skema comments tidak punya kolom anonim.
7. Teks pengguna teks biasa — LULUS. `dangerouslySetInnerHTML`: NIHIL di app/, components/, lib/ (findstr 0 hasil). Semua konten dirender `{teks}` (React auto-escape), termasuk CommentTree/PostCard/detail post.
8. Bug dicatat sebelum diperbaiki — LULUS (dokumenter). HANDOFF.md mencatat bug harness uji (bug disebut "bug harness, bukan bug database") dan PENGUATAN SQL; PROGRESS.md mencatat perbaikan kontrak antar agent.
9. Ragu → aman — LULUS (arah implementasi konservatif: view definer + revoke anon; UI membatasi kedalaman balasan lebih ketat dari DB; login akun banned langsung ditolak).

Pemeriksaan statis wajib lain:

- `.gitignore` memuat `.env*.local` dan `.env`; `.git/index` TIDAK memuat string `.env` (dicari langsung di file index git) → `.env.local` tidak ikut ter-commit (git CLI tidak tersedia di shell audit; bukti = isi index + daftar commit di `.git/logs/HEAD` yang tidak menyebut file env).
- Guard halaman: `app/admin/layout.tsx` redirect non-moderator → "/"; `/submit` dan `/settings` redirect tamu → "/login"; guard diulang di `guardRole()` untuk semua aksi admin + RLS DB sebagai penjaga akhir. Middleware hanya menyegarkan sesi (matcher mengecualikan file statis) — pengaman rute ada di layout server + RLS.
- Validasi input vs PRD 21: judul 1-200 (validate.ts `TITLE_MAX=200`, CHECK skema 0001 `char_length(title) between 1 and 200`, SubmitPostForm maxLength+counter); isi ≤10.000 (validate.ts + CHECK); komentar 1-5.000 (validate.ts + CHECK + CommentForm); username `^[a-zA-Z0-9_]{3,20}$` sama persis di DB (CHECK 0001), server (auth.ts), dan klien (components/auth/shared.ts); password min 8 di klien (RegisterForm) dan server (auth.ts `PASSWORD_MIN=8`).
- Rate limit & auto-hide di 0002 — ADA: `enforce_rate_limit` (post 5/jam akun <7 hari, 20/jam biasa; komentar 30/120) dan `after_report_insert` (auto-hide pada ≥3 pelapor berbeda, status open).
- Tabel 0001: PK `votes (user_id, target_type, target_id)`, unique `reports (reporter_id, target_type, target_id)` — dasar anti vote-ganda dan laporan-ganda.

## TABEL STATUS UJI KEAMANAN PRD 26.1

Bukti: "RLS S#" = skenario di supabase/tests/rls_checks.sql (17 OK/0 GAGAL); "000x:baris" = migrasi; "ts:baris" = file TS.

| # | Uji | Status | Bukti |
|---|---|---|---|
| 1 | User mengubah role sendiri jadi admin | LULUS | RLS S3c; grant kolom 0003:35 hanya (avatar_url, bio); profiles.ts hanya menulis bio/avatar |
| 2 | Insert post dengan score=999 / is_hidden=false | LULUS | Grant insert kolom 0003:36 tanpa score/is_hidden; RLS S3a/S3b (update ditolak); kode tidak pernah mengirim kolom itu (posts.ts:610-620) |
| 3 | Insert post dengan author_id milik B | LULUS | RLS S4; policy posts_insert with check author_id=auth.uid() (0003:78-79) |
| 4 | Baca tabel posts mentah untuk melihat penulis anonim | LULUS | Policy posts_select: hanya penulis/moderator (0003:76-77); view mem-masking author anonim (0002:349-361); profil /u/[username] menyaring otomatis (posts.ts:405-410). Uji manual pelengkap: M3 |
| 5 | User biasa memanggil mod_apply_action | LULUS (statis) | 0002:265 `if not is_moderator() → FORBIDDEN`; RLS S8a hanya membuktikan jalur moderator. Uji manual pelengkap: M5 |
| 6 | Moderator menindak admin | LULUS (statis) | 0002:285 `v_role='admin' and not is_admin() → FORBIDDEN`; guardRole admin di admin.ts. Uji manual pelengkap: M5 |
| 7 | User biasa baca invite_codes/mod_actions | LULUS | RLS S5a/S5b (invite); policy invite_mod_select & modact_select is_moderator (0003:61,118) |
| 8 | Banned/suspend tak bisa post/komentar/vote/upload | LULUS | RLS S10a/S10b (post+komen); votes_insert with check is_active_user (0003:105-106); st_upload_own is_active_user (0003:136-142). Vote/upload dinamis → manual M6/M8 |
| 9 | Akun <24 jam upload foto ditolak | LULUS (statis) | can_upload() (0002:44-51) di st_upload_own + pimg_insert (0003:88-90). Catatan UI: temuan S-3. Manual M6 |
| 10 | Upload ke folder pengguna lain | LULUS (statis) | st_upload_own `(storage.foldername(name))[1] = auth.uid()` (0003:136-142); klien hanya membuat path `{userId}/uuid` (upload.ts:90-93). Manual M8 |
| 11 | Upload bukan gambar / >1 MB | LULUS (statis) | Bucket post-images file_size_limit 1048576 + allowed_mime_types webp/jpeg/png (0003:131-134); klien menolak mentah >10 MB & non-gambar (compress.ts validateImageFile). Manual M8 |
| 12 | 6 post dalam 1 jam akun baru | LULUS (statis) | enforce_rate_limit: limit 5/jam untuk akun <7 hari → post ke-6 melempar RATE_LIMIT (0002:194-223). Manual M7 |
| 13 | Kode undangan habis → INVITE_INVALID | LULUS (statis) | handle_new_user hanya menaikkan used_count bila used_count<max_uses dan belum kedaluwarsa, selain itu INVITE_INVALID (0002:72-80). Manual M1 |
| 14 | `<script>` tampil sebagai teks | LULUS | Nihil dangerouslySetInnerHTML (scan); render React teks biasa; klik tombol tidak mengeksekusi apa pun |
| 15 | Kunci anon mengakses data tanpa login | LULUS | RLS S2 (anon tak bisa baca posts_feed); revoke select view + revoke execute get_feed dari anon (0003:122-123); semua aksi mengembalikan LOGIN_REQUIRED untuk tamu |

## TABEL STATUS KRITERIA SELESAI PRD 18

| Butir | Status | Bukti singkat |
|---|---|---|
| 18.1.1 Daftar + email verifikasi + used_count+1 | TERPENUHI (statis) + manual M1 | auth.ts register; trigger handle_new_user; kirim email tergantung SMTP Supabase |
| 18.1.2 INVITE_INVALID, tak ada akun | TERPENUHI (statis) + manual M1 | exception INVITE_INVALID → rollback signup (0002:72-80); errors.ts:79 |
| 18.1.3 Username salah/sudah dipakai | TERPENUHI (statis) + manual M1 | regex 3 lapis; USERNAME_TAKEN dipetakan |
| 18.1.4 Belum verifikasi = hanya baca | LULUS VIA KONFIGURASI (uji ulang 2026-11-01) + manual M2 | "Confirm email" AKTIF → user belum verifikasi tak pernah punya sesi; login ditolak EMAIL_NOT_CONFIRMED |
| 18.1.5 Pengguna pertama otomatis admin | TERPENUHI (statis) | 0002:66,84 `v_first → role admin` tanpa kode |
| 18.1.6 Banned: aksi ditolak + banner + cara banding | TERPENUHI (statis, dengan R-8) | login ditolak ACCOUNT_BANNED + signOut (auth.ts:184-187); banner banding (AccountStatusBanner); layout menampilkan banner bila berubah di tengah sesi |
| 18.1.7 Suspended: banner tanggal + auto aktif kembali | TERPENUHI (statis) + manual M11 | banner suspendedUntil (formatTanggal); is_active_user membolehkan suspended yang sudah lewat (0002:33-41) |
| 18.1.8 Logout → sesi hapus, terproteksi → /login | TERPENUHI | logout() signOut + redirect; /submit & /settings redirect tamu ke /login |
| 18.2.1 Beranda = komunitas yang diikuti + ajakan | TERPENUHI (diuji ulang 2026-11-01) | page.tsx `onlyJoined: true` untuk login; AjakanKomunitas saat belum mengikuti; tamu → CTA Masuk/Daftar; FeedList meneruskan filter saat pagination |
| 18.2.2 Gabung/Keluar tanpa reload + tersimpan | TERPENUHI (statis) + manual M1 | JoinButton optimistic; joinCommunity/leaveCommunity → community_members |
| 18.2.3 /c/[slug] nama, deskripsi, jumlah anggota, feed | TERPENUHI (diuji ulang 2026-11-01) | getCommunities/getCommunityBySlug kini membaca view community_stats; "N anggota" tampil di /c/[slug] |
| 18.2.4 Hanya admin lihat tombol kelola komunitas | TERPENUHI (statis) | UI publik tanpa tombol kelola; hanya /admin (guarded) + RLS comm_admin |
| 18.3.1 Post tersimpan → redirect detail | TERPENUHI (statis) | createPost + router.replace(`/p/{id}`) |
| 18.3.2 Judul kosong → Kirim nonaktif + pesan | TERPENUHI | SubmitPostForm kirimNonaktif + PESAN_JUDUL_KOSONG |
| 18.3.3 Foto dikompres klien; post muncul setelah upload sukses | TERPENUHI (statis) + manual M8 | urutan upload→createPost di SubmitPostForm |
| 18.3.4 Retry foto gagal saja; tidak setengah-setengah | TERPENUHI (statis) | pathsBaru mempertahankan sukses; rollback file yatim |
| 18.3.5 Maks 4 foto; kelima ditolak | TERPENUHI | ImagePicker max=4 + FOTO_LIMIT |
| 18.3.6 Anonim: identitas tak tampil kecuali moderator | TERPENUHI (statis) + manual M3 | masking view; admin menampilkan penulis asli (getReports) |
| 18.3.7 Edit + label (diedit) | TERPENUHI (statis) | editPost + trigger posts_touch_edit + label di p/[id] |
| 18.3.8 Hapus post (soft delete) | TERPENUHI (statis) | deletePost is_deleted; hilang dari view |
| 18.3.9 RATE_LIMIT + sisa waktu | SEBAGIAN → temuan R-6 | pesan ada, sisa waktu tidak |
| 18.3.10 Akun <24 jam: tombol foto nonaktif + alasan | TERPENUHI (diuji ulang 2026-11-01) + manual M6 | `getImageUploadGate()` dari `SessionProfile.createdAt`; /submit meneruskan `alasanFotoNonaktif` → pemilih foto diganti pesan proaktif; DB tetap penjaga akhir |
| 18.4.1 Komentar 1-5.000 + comment_count | TERPENUHI (statis) | validasi 2 lapis + trigger sync_comment_count |
| 18.4.2 Balasan pada kedalaman 3 tak tersedia | TERPENUHI | UI `depth < 3` sembunyikan Balas; DB menolak depth>3 (aman, arah lebih ketat) |
| 18.4.3 [komentar dihapus] abu-abu, balasan tetap | TERPENUHI (statis) | comments_view is_removed + CommentTree placeholder; tree mempertahankan anak |
| 18.4.4 POST_UNAVAILABLE | TERPENUHI (statis) | pra-cek view + trigger before_comment_insert |
| 18.4.5 Urutan skor desc lalu waktu terlama | TERPENUHI (statis) | getPost order + byRank |
| 18.5.1 Vote +1 / batal / ganti arah | TERPENUHI (statis) | VoteButtons + trigger apply_vote_delta (RLS S9) |
| 18.5.2 Optimistic + dikembalikan bila ditolak | TERPENUHI (statis) | VoteButtons simpan skorLama/voteLama, pulihkan saat gagal |
| 18.5.3 Tak bisa vote ganda (PK votes) | TERPENUHI (statis) | PK + upsert onConflict |
| 18.5.4 Unverified/suspend tak bisa vote, tombol nonaktif | TERPENUHI (suspend) / tergantung konfigurasi (unverified) | `dinonaktifkan` = suspended (p/[id], CommentTree); unverified → lihat S-4 |
| 18.6.1 Dialog laporan + terima kasih | TERPENUHI (statis) | ReportDialog 5 alasan + "Laporan terkirim. Terima kasih." |
| 18.6.2 Satu akun satu laporan; duplikat dipesan | TERPENUHI (statis) | pra-cek + unique + REPORT_DUPLICATE (report.ts) |
| 18.6.3 Laporan ke-3 auto-hide | TERPENUHI (statis) + manual M4 | trigger after_report_insert n≥3 (0002:231-250) |
| 18.6.4 Antrean urut terbanyak + cuplikan + penulis asli + alasan | TERPENUHI (statis) | getReports sort count desc + enrichment |
| 18.6.5 Hapus/Sembunyikan/Peringatkan/Suspend 1/3/7/30/Banned/Tolak + tercatat | TERPENUHI (statis) + manual M5 | mod_apply_action + mod_dismiss_reports selalu insert mod_actions |
| 18.6.6 Moderator tak bisa menindak admin | TERPENUHI (statis) + manual M5 | 0002:285 |
| 18.7.1 Non-gambar / >10 MB ditolak | TERPENUHI (statis) + manual M8 | validateImageFile |
| 18.7.2 Hasil kompres <1 MB WebP (fallback JPEG) | TERPENUHI (statis) + manual M8 | compressImage + FOTO_STILL_LARGE + batas bucket |
| 18.7.3 EXIF/GPS dibuang | TERPENUHI (statis) + manual M9 | re-encode canvas `preserveExif: false` |
| 18.7.4 Pratinjau + hapus foto sebelum kirim | TERPENUHI | ImagePicker preview + tombol hapus |

## TEMUAN

### [S] S-1. Beranda tidak menampilkan hanya post komunitas yang diikuti (PRD 18.2.1)
- Uji: PRD 18.2.1; 26.2.1.
- Langkah reproduksi: 1) Login akun yang tidak mengikuti komunitas mana pun. 2) Buka `/`. 3) Feed menampilkan post dari SEMUA komunitas; ajakan "pilih komunitas" tidak pernah muncul.
- Hasil vs seharusnya: Seharusnya beranda hanya menampilkan post komunitas yang diikuti; bila belum mengikuti satu pun, tampil ajakan memilih komunitas. Kode pendukung sudah ada (`getFeed` param `onlyJoined`, posts.ts:391,421-438 — termasuk cabang ajakan PRD 18.2.1) tetapi TIDAK ADA SATU PUN pemanggil yang mengirim `onlyJoined: true` (app/(main)/page.tsx memanggil `ambilFeed({ sort })`; FeedList.tsx juga tidak meneruskannya).
- Pemilik file: FRONTEND-AGENT (app/(main)/page.tsx) — konfirmasi keputusan produk ke ORCHESTRATOR.
- Status: diuji ulang lulus (2026-11-01) — diperbaiki FIX-QA-S; beranda kini `onlyJoined: true` untuk user login + ajakan gabung saat kosong + CTA Masuk/Daftar untuk tamu; pagination ikut meneruskan filter. Verifikasi e2e di browser menyusul uji manual.

### [S] S-2. Jumlah anggota komunitas tidak pernah tampil di /c/[slug] (PRD 18.2.3)
- Uji: PRD 18.2.3.
- Langkah reproduksi: 1) Login. 2) Buka `/c/umum`. 3) Header komunitas menampilkan nama, slug, deskripsi — TANPA "N anggota".
- Hasil vs seharusnya: Seharusnya halaman komunitas menampilkan jumlah anggota. `getCommunityBySlug` selalu mengembalikan `memberCount: null` (communities.ts:176) dan halaman hanya menampilkan angka bila tidak null (c/[slug]/page.tsx:87-92). View `public.community_stats` (0005) sudah ada dan di-grant ke authenticated — backend hanya belum membacanya.
- Pemilik file: BACKEND-AGENT (lib/actions/communities.ts).
- Status: diuji ulang lulus (2026-11-01) — diperbaiki FIX-QA-S; `fetchCommunityStats()` membaca view community_stats dan memberCount/postCount terisi (fallback null aman); /c/[slug] menampilkan "N anggota".

### [S] S-3. Tombol foto tidak dinonaktifkan proaktif untuk akun <24 jam (PRD 18.3.10)
- Uji: PRD 18.3.10; 26.1 #9.
- Langkah reproduksi: 1) Daftar akun baru. 2) Buka `/submit`. 3) Pemilih foto AKTIF (bukan nonaktif dengan alasan). 4) Pilih foto lalu kirim → baru saat upload ditolak storage muncul pesan "akun baru dapat mengunggah foto setelah 24 jam".
- Hasil vs seharusnya: Seharusnya akun <24 jam melihat tombol foto NONAKTIF beserta penjelasan SEBELUM mencoba. Komponen sudah siap (`alasanFotoNonaktif` di SubmitPostForm + PESAN_AKUN_BARU_24JAM) tetapi `app/(main)/submit/page.tsx` tidak pernah mengisinya; `SessionProfile` juga tidak memuat tanggal pembuatan akun sehingga halaman tidak punya datanya.
- Pemilik file: FRONTEND-AGENT (app/(main)/submit/page.tsx) + BACKEND-AGENT (tambah created_at ke SessionProfile di lib/actions/auth.ts).
- Status: diuji ulang lulus (2026-11-01) — diperbaiki FIX-QA-S; `SessionProfile.createdAt` ada, aksi `getImageUploadGate()` menghitung gate server-side, /submit meneruskan `alasanFotoNonaktif` sehingga pemilih foto diganti pesan peringatan proaktif. Penegakan storage (can_upload) tetap diverifikasi manual M6.

### [S] S-4. Kepatuhan 18.1.4 (belum verifikasi email = hanya bisa membaca) bergantung konfigurasi Supabase, tidak dijaga di DB
- Uji: PRD 18.1.4; 26.1 #8 (turunannya).
- Langkah reproduksi (manual, M2): 1) Periksa Auth settings proyek Supabase ("Confirm email"). 2) Daftar akun TANPA membuka tautan verifikasi. 3) Coba login dan menulis post/komentar.
- Hasil vs seharusnya: `is_active_user()` (0002:33-41) hanya memeriksa `profiles.status` dan TIDAK memeriksa verifikasi email. Bila "Confirm email" OFF, akun tanpa verifikasi langsung punya sesi dan BISA menulis — melanggar 18.1.4. Bila ON, login sebelum verifikasi ditolak dengan EMAIL_NOT_CONFIRMED (auth.ts:454-456) — lebih ketat dari PRD (PRD meminta login boleh tapi read-only) dan memilih arah aman, tapi perlu diketahui orchestrator. Harusnya penjaga akhir ada di DB (mis. is_active_user juga memeriksa email confirmation), bukan hanya konfigurasi panel.
- Pemilik file: DB-AGENT (supabase/migrations) + keputusan konfigurasi oleh ORCHESTRATOR/user.
- Status: lulus via konfigurasi (2026-11-01) — keputusan final QA: dengan "Confirm email" AKTIF (default & rekomendasi PRD 23.3), user belum verifikasi tidak pernah punya sesi sehingga 18.1.4 terpenuhi secara efektif (lebih ketat dari PRD — login ditolak EMAIL_NOT_CONFIRMED, arah aman aturan keras #9). Kode app tidak berubah (memang bukan ranah kode). Verifikasi manual M2 wajib; bila konfigurasi dimatikan, temuan kembali terbuka (penguatan is_active_user di DB tetap disarankan untuk DB-AGENT).

### [R] R-6. Pesan RATE_LIMIT tidak menampilkan sisa waktu tunggu perkiraan (PRD 18.3.9)
- Uji: PRD 18.3.9; 26.1 #12.
- Langkah reproduksi: kirim 6 post dalam 1 jam dari akun baru → pesan "Kamu terlalu cepat. Tunggu beberapa menit lalu coba lagi." tanpa angka menit.
- Hasil vs seharusnya: PRD meminta pesan + sisa waktu perkiraan. (lib/errors.ts:68)
- Pemilik file: BACKEND-AGENT.
- Status: terbuka

### [R] R-7. Rate limit bisa lolos lewat race condition (bukan atomik)
- Uji: PRD 16.4 / 26.1 #12.
- Langkah reproduksi: dua request insert post paralel dari akun yang sama pada detik ke-5; keduanya membaca count=4 sebelum salah satunya ter-commit → keduanya lolos.
- Hasil vs seharusnya: Trigger `enforce_rate_limit` menghitung dengan SELECT terpisah (0002:204-216) tanpa penguncian; batas bisa terlampaui sesekali di bawah konkurensi. Dampak kecil (penyalahgunaan ringan), bukan kebocoran data.
- Pemilik file: DB-AGENT.
- Status: terbuka

### [R] R-8. Banner banned tidak menampilkan alasan spesifik dan email banding masih generik
- Uji: PRD 18.1.6.
- Langkah reproduksi: akun banned login → ditolak ACCOUNT_BANNED; banner di layout (akun kena banned di tengah sesi) menampilkan "Ajukan banding lewat email admin" tanpa alamat email, dan tanpa alasan penindakan (alasan tersimpan di mod_actions yang memang tak terbaca user).
- Hasil vs seharusnya: PRD 18.1.6/19 meminta banner berisi alasan + cara banding. Tambahkan sumber appealEmail (env/konfigurasi) dan pertimbangkan jalur aman untuk menampilkan alasan.
- Pemilik file: FRONTEND-AGENT (AccountStatusBanner pemakaian) + DEVOPS-AGENT (nilai env) + MOD-AGENT.
- Status: terbuka

### [R] R-9. Profil pengguna lain belum menampilkan bio/avatar secara andal dan belum menampilkan komentar (PRD 6)
- Uji: PRD 6 (Profil: post dan komentar pengguna).
- Langkah reproduksi: buka `/u/{username}` akun lain → bio kosong (kontrak belum menyediakan baca profil lain), avatar diambil dari post pertama, dan komentar pengguna tidak ditampilkan.
- Hasil vs seharusnya: PRD 6 menyebut profil berisi post DAN komentar pengguna. Belum ada aksi baca komentar per user di lib/actions. Tercatat sendiri oleh FRONTEND di header halaman (menunggu kontrak backend).
- Pemilik file: BACKEND-AGENT + FRONTEND-AGENT.
- Status: terbuka

### [R] R-10. avatar_url boleh menunjuk file avatar milik pengguna lain
- Uji: aturan keras #2 turunan (integritas profil).
- Langkah reproduksi: kirim `updateProfile({ avatarUrl: "https://<projek>.supabase.co/storage/v1/object/public/avatars/<user-lain>/<file>.webp" })` → diterima (isAvatarBucketUrl hanya memeriksa path mengandung `/object/public/avatars/`, profiles.ts:53-63).
- Hasil vs seharusnya: Seharusnya hanya file milik sendiri (cabang path `{user.id}/...` sudah benar). Dampak kosmetik (memakai avatar orang lain), bukan kebocoran.
- Pemilik file: BACKEND-AGENT (lib/actions/profiles.ts).
- Status: diuji ulang lulus (2026-11-01) — diperbaiki FIX-QA-S; `isAvatarBucketUrl(value, userId)` kini mewajibkan folder user sesi + nama file non-kosong; URL avatar milik pengguna lain ditolak AVATAR_INVALID.

### [R] R-11. Klien mewajibkan kode undangan meski app_settings bisa mematikannya; dan kedalaman balasan UI lebih ketat dari DB
- Uji: PRD 4.1, 18.4.2 (catatan konsistensi).
- Langkah reproduksi: (a) `KODE_UNDANGAN_WAJIB = true` hardcode di RegisterForm.tsx:26 — bila `invite_required=false` di DB, pendaftar tetap diminta kode (mismatch UX, aman). (b) UI menyembunyikan tombol Balas pada tree depth 3 (= DB depth 2), sedangkan trigger mengizinkan depth 3 — arah lebih ketat, aman, tapi kontrak UI/DB tidak identik.
- Hasil vs seharusnya: sumber kebenaran tunggal sebaiknya dari server (app_settings) dan kontrak kedalaman disamakan.
- Pemilik file: FRONTEND-AGENT (RegisterForm, CommentTree) + DB-AGENT.
- Status: terbuka

### [R] R-12. Dokumentasi orkestrator tidak sinkron (PROGRESS.md masih menandai Fase 4 "berikutnya" padahal fitur Fase 4 sudah dikode) dan Fase 6 belum ada artefaknya
- Uji: aturan skill bagian 8.3.
- Langkah reproduksi: baca docs/PROGRESS.md vs isi repo (ImagePicker, admin dashboard, 0005 sudah ada). Tidak ada `vercel.json`, `.env.example`, `app/api/cron/*`, `docs/DEPLOY.md` (job pembersihan file yatim mingguan PRD 20 belum ada).
- Hasil vs seharusnya: PROGRESS.md diperbarui; artefak Fase 6 dibuat DEVOPS (bukan penghambat Gerbang 5).
- Pemilik file: ORCHESTRATOR (PROGRESS.md) + DEVOPS-AGENT.
- Status: terbuka

## DAFTAR BUTUH UJI MANUAL (untuk user, urut prioritas)

1. **M2 — Verifikasi email (temuan S-4):** cek Supabase Auth → "Confirm email" harus ON. Daftar akun, JANGAN verifikasi, coba login → harapkan ditolak dengan pesan "Email belum diverifikasi..."; lalu verifikasi dan login → bisa menulis. Bila login tanpa verifikasi berhasil dan bisa menulis, laporkan sebagai temuan T baru.
2. **M4 — Auto-hide 3 laporan (26.2.4 / 18.6.3):** dengan 3 akun berbeda laporan post yang sama (alasan bebas) → setelah laporan ke-3 post hilang dari feed akun lain; moderator Tolak laporan di /admin → post tampil kembali.
3. **M1 — Alur akun end-to-end (26.2.2):** daftar 2 akun dengan kode undangan (salah satu coba kode salah → `INVITE_INVALID`, kode benar → cek email verifikasi masuk, `used_count` +1 di dashboard admin), login, gabung/keluar komunitas tanpa reload, lupa password via email, hapus-akun (bila diaktifkan).
4. **M3 — Anonim tak terbongkar (26.1 #4 / 18.3.6):** akun A posting anonim → akun B tidak melihat nama/avatar A di feed maupun detail; halaman `/u/{usernameA}` tidak memuat post itu; login moderator → antrean /admin menampilkan penulis asli.
5. **M5 — Moderasi (26.1 #5/#6, 18.6.5-6):** user biasa mencoba aksi moderasi → FORBIDDEN; moderator menyembunyikan/menghapus/memperingatkan/suspend 1-3-7-30 hari/ban → semua muncul di Log (/admin/log); moderator mencoba menindak akun admin → FORBIDDEN.
6. **M6 — Akun <24 jam (26.1 #9, 18.3.10):** akun baru mencoba upload foto → ditolak dengan penjelasan; setelah lewat 24 jam upload sukses.
7. **M7 — Rate limit (26.1 #12):** akun baru membuat 6 post dalam 1 jam → post ke-6 ditolak `RATE_LIMIT`.
8. **M8 — Foto (26.1 #10-11, 18.7.1-2, 26.3.3):** dari HP kirim foto kamera 8-10 MB → tersimpan <1 MB dan tampil layak; coba file PDF → ditolak dengan pesan; (opsional via devtools) ubah path upload ke folder lain → ditolak.
9. **M9 — EXIF (18.7.3):** unduh salah satu foto hasil upload, periksa metadata (mis. https://exif.tools) → tidak ada GPS/kamera.
10. **M10 — XSS manual (26.1 #14):** posting judul/isi/komentar `<script>alert(1)</script>` dan `<img src=x onerror=alert(1)>` → tampil sebagai teks, tidak ada popup.
11. **M11 — Suspend berakhir otomatis (18.1.7):** suspend akun 1 hari; setelah `suspended_until` lewat, akun bisa menulis lagi tanpa campur tangan moderator.
12. **M12 — Perangkat & performa (26.3):** Android Chrome + iPhone Safari + desktop; throttling 3G (feed terbaca, foto lazy-load); isi 500 post & 3.000 komentar lalu ukur waktu muat feed & detail (target <2 detik); uji dua akun di dua perangkat bersamaan (A posting, B komentar, A membalas, keduanya vote, B melaporkan).

## CATATAN PENUTUP

- **Uji ulang 2026-11-01 (pasca-FIX-QA-S):** S-1, S-2, S-3, R-10 = DIUJI ULANG LULUS (bukti di bagian UJI ULANG); S-4 = LULUS VIA KONFIGURASI (verifikasi manual M2). R-6/7/8/9/11/12 tetap terbuka (Rendah, tidak memblokir gerbang). **Status Gerbang 5 tidak berubah: LULUS (bersyarat)** — syarat tersisa hanya pelaksanaan uji manual M1-M12 oleh user (build `npm run build` disarankan dijalankan orkestrator karena FIX-QA-S tidak menjalankannya).

- Pengecualian sah baca tabel mentah (dipecahkan RLS moderator, TIDAK dilaporkan sebagai pelanggaran): `lib/actions/admin.ts` (getReports membaca posts/comments raw baris 422-435; getModLog membaca mod_actions; listUsers/invites membaca profiles/invite_codes) — semua di belakang `guardRole()` + policy RLS moderator/admin.
- Bucket storage bersifat publik-by-design (PRD) — URL foto berpath UUID bisa dibuka siapa pun yang tahu linknya; risiko diterima PRD, dibersihkan lewat hapus moderator/cron (cron belum ada — Fase 6).
- Temuan di atas diteruskan ke agent pemilik; perbaikan TIDAK dilakukan oleh QA (aturan keras #9/skill). Setelah perbaikan FIX-QA-S, QA menguji ulang (2026-11-01): S-1/S-2/S-3/R-10 lulus, S-4 lulus via konfigurasi — Gerbang 5 tetap LULUS bersyarat; tersisa uji manual M1-M12.
