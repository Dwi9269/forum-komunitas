# FASE 4 — MEDIA-AGENT (Foto)

## [FASE 4] MEDIA-AGENT -> ORCHESTRATOR

- **Selesai**: modul kompres + upload foto Fase 4 sesuai PRD (bagian 4.7, 9, 20, 25.1–25.3, 25.6): `lib/image/compress.ts` (kompres klien via `browser-image-compression` — validasi tipe/ukuran mentah maks 10 MB, resize sisi terpanjang 2048 px, WebP kualitas 0,8 target ±400 KB dengan fallback JPEG bila browser tak bisa encode WebP, EXIF dibuang `preserveExif: false`, batas keras hasil 1 MB) dan `lib/image/upload.ts` (upload ke Supabase Storage pakai klien browser lib/supabase/client.ts — sesi via `auth.getUser`, bucket `post-images` path `{userId}/{uuid}.webp|jpg` mengembalikan **PATH** bukan URL sesuai kontrak BACKEND, avatar bucket `avatars` path `{userId}/avatar-{waktu}.webp` maks 512 KB / 512 px mengembalikan **URL publik**, rollback via `deletePostImage`) serta `components/ImagePicker.tsx` (client component: area pilih file, pratinjau thumbnail via `URL.createObjectURL` + revoke saat daftar berubah/unmount, tombol hapus per foto, hitungan "2/4", pesan error inline untuk tipe tak didukung & file mentah > 10 MB sebelum kompres, mode `single` untuk avatar). Komponen TIDAK memanggil Supabase sama sekali — upload berada di lib/image; semua pesan error Indonesia gaya PRD 20 tanpa detail teknis; env tetap lazy (build-safe).

- **File yang dibuat** (milik MEDIA-AGENT, tidak ada file lain yang disentuh):
  - lib/image/compress.ts — kompres + validasi foto klien (PRD 25.2, 4.7, 9). Dependensi `browser-image-compression` diimport (versi ^2.0.2 milik BACKEND di package.json).
  - lib/image/upload.ts — upload/rollback ke Supabase Storage (PRD 25.3, 9), sesi dari klien browser.
  - components/ImagePicker.tsx — pemilih + pratinjau foto (PRD 22, 25.6.2–3), controlled component tanpa akses Supabase.
  - docs/handoff/FASE4-MEDIA.md (file ini). TIDAK menyentuh package.json, lib/errors.ts, lib/actions/**, app/**, components/SubmitPostForm.tsx, settings.

- **Kontrak yang disediakan** (dipakai FRONTEND-AGENT untuk /submit & /settings):
  - `compressImage(file: File, options?: CompressOptions): Promise<File>` — validasi (melempar) lalu kompres; default 2048 px / target 0,4 MB / batas keras 1 MB. `CompressOptions { maxWidthOrHeight?: number; maxSizeMB?: number; maxFinalBytes?: number }`. Hasil selalu WebP atau JPEG (`File` baru bernama `<nama>.webp|.jpg`).
  - `uploadPostImage(file: File): Promise<string>` — kompres lalu upload ke bucket `post-images`, path `{userId}/{uuid}.webp|jpg`; **mengembalikan path storage** (kirimkan ke createPost; tabel post_images menyimpan storage_path).
  - `uploadAvatar(file: File): Promise<string>` — kompres 512 px / batas keras 512 KB, upload ke bucket `avatars`, path `{userId}/avatar-{Date.now()}.webp|jpg`; **mengembalikan URL publik** (simpan ke profiles.avatar_url).
  - `deletePostImage(path: string): Promise<void>` — hapus satu file `post-images` untuk rollback.
  - Konstanta & util: `MAX_RAW_BYTES` (10 MB), `MAX_FINAL_BYTES` (1 MB), `AVATAR_MAX_BYTES` (512 KB), `FOTO_TIPE_DIIZINKAN`, `ekstensiDariTipe(tipe)`, `validateImageFile(file)` (melempar), `fotoError(code, message?)`, `isFotoError(error)`, `FOTO_ERROR_MESSAGES`.
  - Kode error yang dilempar (properti `code` pada `Error`, message sudah ramah): `FOTO_INVALID_TYPE` (tipe tak didukung / HEIC tak terbaca browser), `FOTO_TOO_LARGE` (mentah > 10 MB), `FOTO_STILL_LARGE` (hasil kompres > batas), plus `LOGIN_REQUIRED` (sesi habis), `NETWORK`/`RLS_DENIED`/`FORBIDDEN`/`UNKNOWN` dari extractErrorCode untuk kegagalan storage.
  - `<ImagePicker files onChange max={4} disabled single />` — controlled: pemanggil memiliki state `File[]`; `single` untuk avatar (satu foto bulat + tombol Hapus/Ganti foto); tidak pernah melempar (error tampil inline); tidak memanggil Supabase.
  - Pola integrasi /submit (upload dulu, post kemudian — PRD 25.4):
    ```ts
    const paths: string[] = [];
    try {
      for (const f of files) paths.push(await uploadPostImage(f));
      const id = await createPost({ ..., imagePaths: paths });
    } catch (e) {
      await Promise.allSettled(paths.map((p) => deletePostImage(p))); // rollback; jangan tutup error asli
      setError(tampilkan(e)); // extractErrorCode(e).message, atau e.message utk kode FOTO_*
    }
    ```
  - Pola menampilkan error: `isFotoError(e) ? e.message : extractErrorCode(e).message`.

- **Yang dibutuhkan dari agent lain**:
  - BACKEND-AGENT: dependency `browser-image-compression@^2.0.2` di package.json (sedang ditambahkan) — sampai di-install oleh orchestrator, `next build` error "Cannot find module 'browser-image-compression'"; itu diharapkan, bukan bug (pola yang sama dengan Fase 3).
  - BACKEND-AGENT: mohon daftarkan 4 kode `FOTO_INVALID_TYPE`, `FOTO_TOO_LARGE`, `FOTO_STILL_LARGE`, `FOTO_LIMIT` ke `ErrorCode` + `ERROR_MESSAGES` di lib/errors.ts (nilai bisa disalin dari `FOTO_ERROR_MESSAGES` di lib/image/compress.ts) supaya `extractErrorCode` mengenalinya. Sampai itu, `extractErrorCode` mengembalikan UNKNOWN untuk kode FOTO_* — UI tetap aman memakai `e.message` langsung karena message sudah berisi pesan ramah yang sama.
  - BACKEND-AGENT: kontrak `createPost` menerima daftar path foto (disimpan ke `post_images.storage_path` + width/height/position bila tersedia) dan melakukan rollback hapus file bila insert post/relasi gagal (PRD 25.4); bucket `post-images` & `avatars` dengan policy "user login hanya upload ke foldernya sendiri" (PRD 9).
  - FRONTEND-AGENT: integrasi di /submit (ImagePicker + loop `uploadPostImage` + rollback `deletePostImage`, kirim daftar path ke createPost) dan /settings (ImagePicker `single` + `uploadAvatar` → simpan URL ke profil). Jalankan upload HANYA dari client component (module ini butuh browser).
  - ORCHESTRATOR: `npm install` setelah BACKEND menambahkan dependency.

- **Asumsi / keputusan**:
  1. Dimensi kompres 2048 px mengikuti instruksi fase (PRD 25.2 menulis 1600 px), tetapi target ukuran tetap 0,4 MB (±200–400 KB, PRD 25.6.4) dan batas keras 1 MB (PRD 9) — dua-duanya terpenuhi sekaligus.
  2. HEIC/HEIF diterima SEBELUM kompres agar foto iPhone bisa dikonversi bila browser mendukung (PRD 20 kasus tepi 7); bila dekode gagal, error `FOTO_INVALID_TYPE` dengan pesan "coba pilih foto berformat JPG" (PRD 25.6.1). GIF ditolak (tidak didukung MVP). Hasil upload selalu WebP/JPEG sesuai daftar MIME PRD 9.
  3. Fallback JPEG: dideteksi via `canvas.toDataURL("image/webp")` (di-cache) karena opsi `fileType` library tidak otomatis fallback; ekstensi path mengikuti hasil aktual (`webp`/`jpg`) — path tetap sesuai pola `{userId}/{uuid}` PRD 9.
  4. `uploadPostImage` sengaja satu file per panggilan dan mengembalikan path (bukan URL) sesuai kontrak BACKEND; batas 4 foto divalidasi UI (ImagePicker, pesan "Maksimal N foto", kode `FOTO_LIMIT` disiapkan) — pemanggil yang menggabungkan.
  5. Validasi tipe/ukuran hanya di compress.ts (satu sumber kebenaran); upload.ts mempercayainya, lalu menangani sesi, storage, dan pemetaan error via extractErrorCode (NETWORK/RLS_DENIED/UNKNOWN) tanpa membocorkan detail teknis.
  6. Sesi diambil via `supabase.auth.getUser()` (bukan getSingleSession server) karena upload jalan di browser; sesi kosong → `LOGIN_REQUIRED` dengan pesan PRD 20.
  7. Avatar pakai `upsert: false` + nama `avatar-{Date.now()}` agar URL lama tidak tertimpa saat upload baru; pemanggil memperbarui profiles.avatar_url (pembersihan avatar lama menyusul kebutuhan).
  8. `deletePostImage` bisa gagal (mis. RLS) — dilempar sebagai error ramah, tetapi pemanggil disarankan `allSettled`/catch kosong agar error asli tidak tertutup; sisa file yatim dibersihkan job mingguan (PRD 20.3, 23).
  9. Pratinjau ImagePicker: object URL dibuat per perubahan daftar dan di-revoke pada cleanup effect (mencakup unmount) — tanpa kebocoran; `<img>` diberi width/height + `loading="lazy"` (PRD 25.6.3); input direset (`value = ""`) agar file yang sama bisa dipilih ulang.
  10. Tidak ada `"use server"`/akses DB di ketiga file; lib/image hanya boleh dipanggil dari client component (compressImage/upload melempar error jelas bila dijalankan di server).

- **Cara memeriksa**:
  1. `npm install` (setelah BACKEND menambahkan dependency) lalu `npm run build` tanpa env asli — harus lulus (env lazy; tidak ada pemanggilan Supabase saat build).
  2. Integrasi sementara di halaman apa pun (client): render `<ImagePicker files={f} onChange={setF} />` — pilih 5 foto → pesan "Maksimal 4 foto."; pilih .gif / file > 10 MB → pesan inline, tidak ada pratinjau; hapus per foto mengubah hitungan "2/4".
  3. Dengan env asli + storage dibuat: pilih foto JPG/PNG besar (±5 MB) → submit → cek bucket `post-images/{userId}/{uuid}.webp` ukuran ±200–400 KB, EXIF (GPS) hilang, path tersimpan lewat createPost.
  4. Safari lama/tanpa WebP → hasil .jpg; HEIC di Chrome → pesan "Browser tidak bisa membaca foto ini. Coba pilih foto berformat JPG."
  5. /settings (setelah FRONTEND): avatar 512 px/512 KB muncul dari URL publik; logout lalu coba upload → pesan "Kamu harus login untuk melakukan aksi ini."
  6. Matikan jaringan saat upload → pesan "Koneksi bermasalah. Coba lagi." (NETWORK), tanpa stack trace di UI.
