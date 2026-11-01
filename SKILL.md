---
name: forum-multi-agent-builder
description: Orkestrasi beberapa agent (orchestrator, database, backend, frontend, media, moderasi, QA, devops) untuk membangun aplikasi forum komunitas ala Reddit/Threads dengan Next.js + Supabase berdasarkan PRD. Gunakan skill ini setiap kali user meminta membangun, melanjutkan, memperbaiki, atau menguji aplikasi forum/komunitas ini, menyebut PRD, skema database, RLS, upload foto, moderasi, atau meminta pekerjaan dibagi ke beberapa agent, walaupun user tidak menyebut kata multi-agent.
---

# Forum Multi-Agent Builder

Skill ini mengatur cara beberapa agent bekerja sama membangun forum komunitas (Next.js App Router + TypeScript + Tailwind + Supabase + Vercel) sesuai PRD.

## 0. Prinsip utama

1. **PRD adalah sumber kebenaran.** Jangan mengarang fitur, tabel, atau aturan di luar PRD. Jika ada yang bertentangan atau kurang, catat di `docs/OPEN_QUESTIONS.md` dan lanjutkan dengan asumsi paling aman, jangan berhenti menunggu.
2. **Kontrak dulu, kode kemudian.** Sebelum agent menulis kode, kontraknya harus jelas: skema SQL (PRD bagian 8, 16, 17), kontrak aksi data (bagian 24), kode error (bagian 20).
3. **Satu pemilik per file.** Dua agent tidak boleh mengedit file yang sama pada fase yang sama. Lihat tabel kepemilikan di bagian 3.
4. **Satu langkah, satu gerbang.** Setiap fase punya gerbang (gate) yang harus lulus sebelum fase berikutnya. Jangan lompat.
5. **Hemat token.** Baca hanya bagian PRD yang relevan (sebut nomor bagian). Jangan menempel ulang seluruh PRD. Jangan menulis ulang file yang sudah benar.
6. **Keamanan bukan opsional.** RLS, hak kolom, dan uji keamanan (PRD 26.1) wajib lulus sebelum deploy.

## 1. Persiapan awal (orchestrator, sekali saja)

1. Pastikan PRD ada di repo sebagai `docs/PRD.md`. Jika belum, minta user mengekspor PRD ke Markdown dan menaruhnya di sana.
2. Buat berkas:
   - `docs/PROGRESS.md`: checklist fase dan status tiap agent.
   - `docs/OPEN_QUESTIONS.md`: pertanyaan dan asumsi.
   - `docs/HANDOFF.md`: catatan serah terima antar agent (format di bagian 5).
3. Inisialisasi Git. Commit awal. Setiap fase yang lulus gerbang di-commit dengan pesan `fase N: <ringkasan>`.
4. Cek apakah platform mendukung sub-agent paralel sungguhan.
   - **Ya**: jalankan agent independen paralel sesuai bagian 4.
   - **Tidak**: jalankan **mode peran berurutan**. Satu model memakai satu peran pada satu waktu, menyatakan peran aktif di awal setiap blok kerja (contoh: `[PERAN: DB-AGENT]`), dan hanya menyentuh file milik peran itu.

## 2. Daftar agent

### ORCHESTRATOR
- Memecah pekerjaan, menetapkan urutan, memeriksa gerbang, menyelesaikan konflik, memperbarui `PROGRESS.md`.
- Tidak menulis kode fitur kecuali menyatukan hasil. Tidak mengubah keputusan PRD tanpa mencatatnya.

### DB-AGENT (database dan keamanan data)
- Memegang: `supabase/migrations/*`.
- Tugas: menerjemahkan PRD bagian 8, 16, 17 menjadi file migrasi berurutan (`0001_schema.sql`, `0002_functions_triggers.sql`, `0003_rls_storage.sql`, `0004_seed.sql`).
- Aturan: jangan mengubah isi SQL PRD tanpa alasan tertulis. Jika menemukan bug di SQL PRD, perbaiki di migrasi dan catat di `HANDOFF.md` supaya PRD diperbarui.
- Keluaran: migrasi yang berjalan bersih dari database kosong, ditambah `supabase/tests/rls_checks.sql` berisi uji RLS sederhana.

### BACKEND-AGENT (lapisan data dan auth)
- Memegang: `lib/supabase/*`, `lib/actions/*`, `lib/errors.ts`, `middleware.ts`.
- Tugas: klien Supabase (browser, server), middleware sesi, semua aksi di PRD bagian 24, peta kode error ke pesan ramah (bagian 20), validasi input (bagian 21).
- Aturan: validasi di app **dan** andalkan database sebagai penjaga akhir. Jangan pernah memakai kunci service role di kode yang berjalan di klien.

### FRONTEND-AGENT (tampilan dan interaksi)
- Memegang: `app/(auth)/*`, `app/(main)/*`, `components/*`, gaya global.
- Tugas: halaman dan komponen sesuai bagian 6 dan 22, mobile-first, state loading/kosong/error di semua daftar, optimistic update untuk vote.
- Aturan: tidak memanggil database langsung dari komponen. Selalu lewat fungsi di `lib/actions`. Teks pengguna dirender sebagai teks biasa (tanpa HTML mentah).

### MEDIA-AGENT (foto)
- Memegang: `lib/image/*`, `components/ImagePicker.tsx`.
- Tugas: kompres dan upload sesuai PRD bagian 25, pratinjau, pesan error foto, batas 4 foto.
- Aturan: hasil kompres di bawah 1 MB, metadata EXIF dibuang, rollback file bila simpan post gagal.

### MOD-AGENT (moderasi dan admin)
- Memegang: `app/admin/*`, `components/admin/*`, `components/ReportDialog.tsx`.
- Tugas: dialog laporan, antrean laporan, tindakan moderator lewat RPC, log, kelola kode undangan dan komunitas, thumbnail laporan diburamkan.
- Aturan: semua tindakan moderasi hanya lewat RPC `mod_apply_action` dan `mod_dismiss_reports`.

### QA-AGENT (penguji independen)
- Memegang: `tests/*`, `docs/QA_REPORT.md`. **Tidak boleh mengedit kode fitur**, hanya melaporkan.
- Tugas: menjalankan uji keamanan PRD 26.1, kriteria selesai bagian 18, dan uji perangkat 26.3. Menulis temuan dengan langkah reproduksi, tingkat keparahan, dan agent pemilik file terkait.
- Aturan: bersikap skeptis. Anggap fitur belum selesai sampai terbukti lewat uji, bukan sampai agent lain bilang selesai.

### DEVOPS-AGENT (rilis)
- Memegang: `app/api/cron/*`, `vercel.json`, `.env.example`, `docs/DEPLOY.md`.
- Tugas: environment variable (bagian 23.2), cron pembersihan, panduan deploy, domain, SMTP, daftar periksa peluncuran (bagian 27), halaman legal (bagian 28).
- Aturan: tidak pernah meng-commit rahasia. `.env.example` hanya berisi nama variabel.

## 3. Kepemilikan file (pencegah konflik)

| Area | Pemilik | Boleh diubah agent lain? |
|---|---|---|
| `supabase/migrations/*` | DB-AGENT | Tidak. Ajukan lewat HANDOFF |
| `lib/supabase/*`, `lib/actions/*`, `lib/errors.ts`, `middleware.ts` | BACKEND-AGENT | Tidak |
| `app/(auth)/*`, `app/(main)/*`, `components/*` (kecuali admin, ImagePicker, ReportDialog) | FRONTEND-AGENT | Tidak |
| `lib/image/*`, `components/ImagePicker.tsx` | MEDIA-AGENT | Tidak |
| `app/admin/*`, `components/admin/*`, `components/ReportDialog.tsx` | MOD-AGENT | Tidak |
| `tests/*`, `docs/QA_REPORT.md` | QA-AGENT | Tidak |
| `app/api/cron/*`, `vercel.json`, `.env.example`, `docs/DEPLOY.md`, `app/legal/*` | DEVOPS-AGENT | Tidak |
| `docs/PROGRESS.md`, `docs/OPEN_QUESTIONS.md` | ORCHESTRATOR | Semua boleh **menambah** catatan di OPEN_QUESTIONS |

Jika sebuah agent butuh perubahan di file milik agent lain, ia menulis permintaan di `docs/HANDOFF.md`, bukan mengedit sendiri.

## 4. Fase, urutan, dan gerbang

### Fase 1: Fondasi
- **DB-AGENT** menulis migrasi. **BACKEND-AGENT** menyiapkan proyek Next.js, klien Supabase, middleware. **FRONTEND-AGENT** menyiapkan komponen dasar dan layout (paralel, tidak bergantung).
- **Gerbang 1**: migrasi jalan dari database kosong tanpa error; app jalan di localhost; RLS aktif di semua tabel.

### Fase 2: Akun
- **BACKEND** auth dan peta error. **FRONTEND** halaman daftar, login, lupa password, banner status akun.
- **Gerbang 2**: daftar dengan kode undangan benar berhasil, kode salah ditolak (`INVITE_INVALID`), pengguna pertama menjadi admin. Kriteria PRD 18.1 lulus.

### Fase 3: Inti forum
- **BACKEND** aksi feed, post, komentar, vote, komunitas. **FRONTEND** feed, komunitas, detail post, form post (tanpa foto), komentar bertingkat, vote.
- **Gerbang 3**: kriteria PRD 18.2, 18.3 (tanpa foto), 18.4, 18.5 lulus. Post anonim tidak membocorkan penulis di respons API publik.

### Fase 4: Foto dan moderasi (paralel)
- **MEDIA** kompres dan upload. **MOD** laporan dan dashboard admin.
- **Gerbang 4**: kriteria PRD 18.6 dan 18.7 lulus. Auto-hide pada 3 laporan bekerja.

### Fase 5: Audit independen
- **QA-AGENT** menjalankan seluruh uji keamanan PRD 26.1 dan kriteria bagian 18. Menulis `docs/QA_REPORT.md`.
- Agent pemilik memperbaiki temuan. QA menguji ulang.
- **Gerbang 5**: semua uji keamanan lulus, tidak ada temuan tingkat Tinggi yang terbuka.

### Fase 6: Rilis
- **DEVOPS** cron pembersihan, halaman legal, dokumen deploy, daftar periksa bagian 27.
- **Gerbang 6**: daftar periksa PRD bagian 27 terpenuhi.

Jangan memulai fase berikutnya sebelum gerbang lulus dan ORCHESTRATOR mencentang `PROGRESS.md` serta melakukan commit.

## 5. Format serah terima (`docs/HANDOFF.md`)

Setiap agent menambahkan entri di akhir pekerjaannya:

```
## [FASE N] <AGENT> -> <AGENT TUJUAN>
- Selesai: <daftar singkat>
- File yang dibuat/diubah: <path>
- Kontrak yang disediakan: <fungsi/tabel/kode error beserta tanda tangannya>
- Yang dibutuhkan dari agent lain: <permintaan, atau 'tidak ada'>
- Asumsi / keputusan: <jika ada>
- Cara memeriksa: <perintah atau langkah singkat>
```

## 6. Format laporan QA (`docs/QA_REPORT.md`)

```
### [T/S/R] <judul temuan>   (T=Tinggi, S=Sedang, R=Rendah)
- Uji: <nomor uji PRD>
- Langkah reproduksi: <1..n>
- Hasil sebenarnya vs seharusnya:
- Pemilik file: <agent>
- Status: terbuka | diperbaiki | diuji ulang lulus
```

Tinggi = kebocoran data, bypass RLS, eskalasi hak, atau konten anonim terbongkar. Semua temuan Tinggi wajib selesai sebelum rilis.

## 7. Aturan keras (jangan dilanggar)

1. Jangan menonaktifkan RLS untuk memudahkan pengembangan.
2. Jangan memberi klien hak insert/update atas kolom `score`, `is_hidden`, `role`, `status`, `used_count`.
3. Klien membaca post dan komentar lewat view `posts_feed` dan `comments_view`, bukan tabel mentah.
4. Kunci `SUPABASE_SERVICE_ROLE_KEY` hanya di sisi server dan cron.
5. Tidak ada fitur video, DM, atau notifikasi push di MVP.
6. Komentar tidak bisa anonim di MVP.
7. Semua teks pengguna dirender sebagai teks biasa.
8. Jangan menghapus atau menulis ulang file pekerjaan agent lain.
9. Setiap bug yang ditemukan dicatat dulu, baru diperbaiki oleh pemilik file.
10. Jika ragu antara cepat dan aman, pilih aman.

## 8. Cara memulai saat skill dipanggil

1. Baca `docs/PROGRESS.md` untuk mengetahui fase saat ini. Jika belum ada, jalankan bagian 1.
2. Tampilkan ke user rencana singkat: fase yang akan dikerjakan, agent yang terlibat, dan gerbangnya (maksimal 10 baris).
3. Kerjakan fase itu sesuai bagian 4. Setelah gerbang lulus: commit, perbarui `PROGRESS.md`, ringkas hasilnya dalam 3\u20135 baris, lalu lanjut ke fase berikutnya.
4. Jika menemui hambatan yang tidak bisa diselesaikan dengan asumsi aman (misalnya butuh kunci API atau keputusan produk), berhenti di titik itu dan tanyakan **satu** pertanyaan spesifik kepada user.
5. Pada akhir sesi, tulis ringkasan di `PROGRESS.md`: apa yang selesai, apa berikutnya, dan masalah terbuka. Itu menjadi titik awal sesi selanjutnya.
