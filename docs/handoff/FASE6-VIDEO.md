# FASE 6 — MEDIA-AGENT (Video Pendek, Pasca-MVP 15)

## [FASE 6] MEDIA-AGENT -> ORCHESTRATOR

- **Selesai**: fitur video pendek Pasca-MVP 15 (PRD bagian 15: video 30–60 detik, 1 video per post, opsional, dikompres di klien) lengkap dari kompres klien sampai tampilan: `lib/image/video.ts` (kompres klien via `<video>` tersembunyi → `<canvas>` 480p → `canvas.captureStream(30)` → `MediaRecorder` 400 kbps, mimeType prioritas `video/webm;codecs=vp9` → `vp8` → `video/mp4`, berhenti saat video selesai / maks 61 detik; validasi awal tipe `video/*` + mentah ≤ 30 MB + durasi metadata ≤ 61 detik), `lib/actions/media.ts` (server action `uploadVideo(formData)` ke **Vercel Blob** `videos/{user_id}/{uuid}.{ext}` akses publik — validasi tipe webm/mp4/quicktime + ≤ 8 MB + gate sesi LOGIN_REQUIRED/FORBIDDEN; `hapusVideo(url)` untuk rollback dengan cek folder milik sendiri), `components/VideoPicker.tsx` (pemilih 1 video opsional + pratinjau `<video controls>` + tombol hapus + validasi awal), integrasi `SubmitPostForm.tsx` (video & foto SALING EKSKLUSIF; alur kirim kompresVideo → uploadVideo → createPost({ videoUrl }) dengan progres "Mengompres video..." → "Mengunggah video..." → "Menyimpan post..."; gagal → error inline + tombol "Kirim tanpa video"), indikator "🎬 Video" di `PostCard.tsx`, pemutar `<video controls preload="metadata">` di detail `app/(main)/p/[id]/page.tsx`, plus `videoUrl` di view model `components/feed/types.ts`.

- **File yang dibuat/diubah** (milik MEDIA-AGENT; file lain tidak disentuh):
  - `supabase/migrations/0011_video.sql` — BARU: `posts.video_url text` (idempoten), ulang grant kolom posts pola 0003 dengan `video_url` pada INSERT SAJA (TANPA grant update — video tidak bisa diedit), rekreasi `posts_feed` menambah `p.video_url` (definisi disalin persis 0002 baris 349–361, definisi terakhir view; tanpa BEGIN/COMMIT).
  - `lib/image/video.ts` — BARU (client, bukan "use server"): `kompresVideo(file): Promise<File>` + konstanta (`VIDEO_RAW_MAX_BYTES` 30 MB, `VIDEO_DURASI_MAKS_DETIK` 61) + util error (`videoError`, `isVideoError`, `VideoErrorCode`).
  - `lib/actions/media.ts` — BARU ("use server"): `uploadVideo(formData) → ActionResult<{ url, pathname }>`, `hapusVideo(url) → ActionResult<{ deleted: boolean }>`.
  - `lib/errors.ts` — TAMBAH kode: `VIDEO_TOO_LARGE`, `VIDEO_DURATION` ("Video maksimal 60 detik."), `VIDEO_INVALID` ("Format video tidak didukung."), plus `BLOB_UNAVAILABLE` ("Penyimpanan video belum terhubung.") untuk env Blob hilang.
  - `lib/actions/posts.ts` — PERLUASAN `createPost`: input opsional `videoUrl?: string` divalidasi (harus mengandung `.public.blob.vercelstorage.com` DAN `videos/${user.id}/` → selain itu VIDEO_INVALID) lalu disimpan ke kolom `video_url` saat insert; interface `FeedPost`/`PostFeedRow` ditambah `video_url: string | null`. Kontrak lain (feed/detail/edit/hapus) TIDAK berubah.
  - `components/VideoPicker.tsx` — BARU (client, pola ImagePicker): props `file: File | null`, `onChange(file: File | null)`, `disabled?`; area pilih `video/*`, pratinjau blob lokal, hapus, validasi awal tipe + ≤ 30 MB, bantuan "Video 30-60 detik, dikompres otomatis saat dikirim".
  - `components/SubmitPostForm.tsx` — INTEGRASI: VideoPicker di bawah foto; eksklusivitas dua arah (pilih video → ImagePicker disabled + daftar foto dibersihkan, dan sebaliknya) dengan catatan kecil; alur video + rollback `hapusVideo` bila createPost gagal.
  - `components/feed/types.ts` — TAMBAH `videoUrl: string | null` pada `FeedPostView` + `PostDetailView` (membaca `videoUrl`/`video_url`).
  - `components/PostCard.tsx` — indikator kecil "🎬 Video" pada kartu bila `post.videoUrl` ada (tanpa pemutar penuh).
  - `app/(main)/p/[id]/page.tsx` — pemutar `<video controls preload="metadata" className="w-full rounded-lg">` di bawah isi bila `post.videoUrl` ada (tanpa autoplay).
  - `docs/handoff/FASE6-VIDEO.md` (file ini).

- **Kontrak yang disediakan**:
  - `kompresVideo(file: File): Promise<File>` — klien saja (melempar bila di server). Melempar `VideoError` berkode: `VIDEO_INVALID` (bukan video/*, browser tanpa MediaRecorder/captureStream → pesan "Browser tidak mendukung perekaman video", gagal dekode, hasil kosong), `VIDEO_TOO_LARGE` (mentah > 30 MB), `VIDEO_DURATION` (durasi metadata > 61 detik). Message sudah ramah Indonesia tanpa detail teknis.
  - `uploadVideo(formData: FormData): Promise<ActionResult<{ url, pathname }>>` — field `file` (SUDAH hasil kompresVideo). Validasi server: tipe `video/webm|video/mp4|video/quicktime`, ukuran ≤ 8 MB. Gate: tidak login → `LOGIN_REQUIRED`, status bukan "active" → `FORBIDDEN`; env `BLOB_READ_WRITE_TOKEN` dibaca LAZY di dalam fungsi (build tanpa token tetap sukses; runtime tanpa token → `BLOB_UNAVAILABLE`). Path blob: `videos/{user.id}/{crypto.randomUUID()}.{ext}`, `access: "public"`.
  - `hapusVideo(url: string): Promise<ActionResult<{ deleted: boolean }>>` — URL wajib mengandung `videos/{user.id}/` (milik orang lain → FORBIDDEN); dipakai rollback bila createPost gagal setelah upload.
  - `createPost({ ..., videoUrl? })` — URL hanya disimpan bila lolos validasi domain + folder milik sendiri; disimpan SEKALI saat insert (kolom `video_url`; tanpa grant update di 0011, jadi tidak bisa diganti/dihapus lewat editPost).
  - View model: `FeedPostView.videoUrl` / `PostDetailView.videoUrl` (null = tanpa video).
  - `<VideoPicker file onChange disabled />` — controlled; tidak pernah melempar (error tampil inline); tidak mengakses Supabase/Blob.

- **Yang dibutuhkan dari agent lain / ORCHESTRATOR**:
  - ORCHESTRATOR: jalankan migrasi `supabase/migrations/0011_video.sql` (tanpa BEGIN/COMMIT — dibungkus orkestrator) lalu VERIFIKASI view `posts_feed` punya kolom `video_url` (mis. `select video_url from public.posts_feed limit 1`). View dibuat ulang di 0011; tanpa migrasi, `select *` tidak mengembalikan video_url dan fitur tampil kosong (bukan error).
  - ORCHESTRATOR: `npm install @vercel/blob` — sudah dijalankan MEDIA-AGENT di akhir (dependency `@vercel/blob` di package.json); sampai ter-install, `next build` error "Cannot find module '@vercel/blob'" itu diharapkan, bukan bug.
  - ORCHESTRATOR: pastikan env `BLOB_READ_WRITE_TOKEN` ada di .env.local (sudah) dan di Vercel project env (store `forum-media` sudah terhubung). Token dibaca lazy — build tanpa token tetap lulus.
  - BACKEND-AGENT: tidak ada perubahan tambahan yang diminta; `createPost` sudah menerima `videoUrl`.
  - QA: lihat "Cara memeriksa" di bawah.

- **Asumsi / keputusan**:
  1. Video disimpan di **Vercel Blob** (store `forum-media`), BUKAN Supabase Storage — sesuai instruksi Fase 6; path `videos/{user_id}/{uuid}.ext` mengikuti pola path-per-pengguna PRD 9.
  2. Kompres klien hanya membawa GAMBAR (canvas.captureStream tanpa track audio) — video hasil kompres TANPA suara; dicatat sebagai batasan (video pendek forum). Audio asli tidak dibawa ke hasil.
  3. Batas durasi diproses 61 detik (bukan 60) untuk memberi toleransi pembulatan metadata; pesan UI tetap "maksimal 60 detik" (PRD 15). Perekaman juga dipotong keras di 61 detik.
  4. Server menerima ≤ 8 MB setelah kompres (400 kbps × 60 detik ≈ 3 MB + container; 8 MB memberi ruang aman); file mentah dibatasi 30 MB di klien. Pelanggaran → `VIDEO_TOO_LARGE`.
  5. Eksklusivitas foto vs video ditegakkan di UI (pilih salah satu; memilih video membersihkan foto dan menonaktifkan ImagePicker, dan sebaliknya) — server TIDAK menolak kombinasi keduanya (tidak diwajibkan tampilan kartu).
  6. `video_url` hanya bisa diisi saat INSERT (grant kolom 0011); editPost tetap hanya title/body — video tidak bisa diganti/dihapus setelah post dibuat.
  7. `hapusVideo` gagal di-telan pemanggil (`Promise.allSettled`) agar error asli createPost tidak tertutup; file yatim dibersihkan job mingguan bersama foto (PRD 20 kasus tepi 3).
  8. PostCard hanya indikator "🎬 Video" (tanpa pemutar) — pemutar penuh hanya di halaman detail (keputusan performa feed).
  9. Pratinjau VideoPicker memakai `URL.createObjectURL` + revoke di cleanup effect (pola ImagePicker, PRD 25.6.2); input direset agar file yang sama bisa dipilih ulang.
  10. `kompresVideo` memakai `requestVideoFrameCallback` bila tersedia (sinkron frame dekode), fallback `requestAnimationFrame`; hasil 0 byte → VIDEO_INVALID agar tidak mengunggah file kosong.

- **Cara memeriksa**:
  1. ORCHESTRATOR: jalankan migrasi 0011 → `select column_name from information_schema.columns where table_name='posts' and column_name='video_url';` mengembalikan 1 baris; `select video_url from public.posts_feed limit 1;` sukses (view punya kolom).
  2. `npm install` (sudah dijalankan untuk @vercel/blob) lalu `npm run build` tanpa env asli — harus lulus (token Blob dibaca lazy).
  3. /submit: pilih video > 30 MB / bukan video → pesan inline, tidak ada pratinjau; pilih video valid → pratinjau `<video>` tampil + tombol Hapus; ImagePicker otomatis nonaktif + catatan "pilih salah satu" muncul; hapus video → foto aktif kembali.
  4. Kirim post dengan video 60 detik: progres "Mengompres video..." → "Mengunggah video..." → "Menyimpan post..." → redirect detail; cek Vercel Blob store `forum-media` berisi `videos/{userId}/{uuid}.webm` (≤ ±3–4 MB, 480p) dan `posts.video_url` terisi.
  5. Video 2 menit → error inline "Video maksimal 60 detik." saat kirim; browser tanpa MediaRecorder → "Browser tidak mendukung perekaman video."; tombol "Kirim tanpa video" tetap bisa menyimpan post.
  6. Feed: kartu post bervideo menampilkan badge "🎬 Video" (tanpa pemutar); detail: pemutar `<video controls>` di bawah isi, tidak autoplay.
  7. Stop token Blob (hapus env) → kirim video gagal dengan pesan ramah "Belum terhubung ke Vercel Blob." + opsi kirim tanpa video; post tanpa video tetap normal (tidak menyentuh Blob).
