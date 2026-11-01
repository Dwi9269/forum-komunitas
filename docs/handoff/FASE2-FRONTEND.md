## [FASE 2] FRONTEND-AGENT -> ORCHESTRATOR

- **Selesai**: seluruh halaman & alur akun Fase 2 sesuai PRD (bagian 4.1, 6, 19, 20, 21, 22.5) — layout auth terpusat dengan logo/nama forum + tautan balik ke beranda, halaman Masuk, Daftar (dengan kode undangan wajib + layar "Cek email kamu untuk verifikasi"), Lupa password (layar sukses netral, tidak membocorkan email terdaftar), Password baru (deteksi tautan kedaluwarsa dari query maupun hash), dan komponen banner status akun (disuspend/diblokir) siap dipakai layout utama. Semua form adalah Client Component (useState + useTransition), memanggil aksi server HANYA lewat `@/lib/actions/auth` — tidak ada pemanggilan Supabase langsung dari komponen. Bahasa Indonesia, mobile-first, memakai kit `components/ui` (Button loading state, Input label+error aksesibel, Card, Spinner, AuthSuccess baru).

- **File yang dibuat/diubah**:
  - `app/(auth)/layout.tsx` — layout tengah card, logo + nama "Forum Komunitas", tautan "← Kembali ke beranda".
  - `app/(auth)/login/page.tsx` + `components/auth/LoginForm.tsx`
  - `app/(auth)/register/page.tsx` + `components/auth/RegisterForm.tsx`
  - `app/(auth)/reset/page.tsx` + `components/auth/RequestResetForm.tsx`
  - `app/(auth)/reset/confirm/page.tsx` + `components/auth/UpdatePasswordForm.tsx`
  - `components/auth/AuthSuccess.tsx` — panel layar sukses (ikon centang, warna success).
  - `components/auth/shared.ts` — tipe `AuthActionResult`, `pesanError()` (fallback ke peta `lib/errors.ts`), regex/pesan validasi PRD 21.
  - `components/AccountStatusBanner.tsx` — banner disuspend (tanggal, alasan, tautan "Baca aturan") / diblokir (alasan, email banding).
  - `docs/handoff/FASE2-FRONTEND.md` (file ini). Tidak menyentuh lib/**, supabase/**, middleware.ts, app/page.tsx, app/layout.tsx, docs/PROGRESS.md.

- **Kontrak yang disediakan** (dipakai fase berikutnya):
  - `components/AccountStatusBanner`: props `status: "suspended" | "banned"`, `suspendedUntil?: string|number|Date|null` (difomat `Intl.DateTimeFormat("id-ID")`), `reason?: string|null`, `appealEmail?: string|null` (untuk banned, dirender mailto), `rulesHref?: string` (default "/rules"). Server component murni — aman dipasang di layout main.
  - Rute yang bisa diarahkan pengguna: `/login`, `/register`, `/reset`, `/reset/confirm` (tujuan tautan email reset).
  - `components/auth/shared.ts`: `AuthActionResult { ok; needsEmailConfirmation?; code?; message? }` — bentuk konsumsi UI; `pesanError(hasil)` memakai `hasil.message` lalu fallback `ERROR_MESSAGES` dari `lib/errors.ts` (impor baca-saja).

- **Yang dibutuhkan dari agent lain**:
  - BACKEND-AGENT: `lib/actions/auth.ts` dengan `register`, `login`, `logout`, `requestPasswordReset`, `updatePassword` sesuai kontrak yang disepakati (hasil `{ ok, ... } | { ok:false, code, message }`). Sampai file itu ada, `next build`/`tsc` akan error "Cannot find module '@/lib/actions/auth'" — itu diharapkan, UI sudah lengkap dan tinggal nyambung.
  - BACKEND-AGENT: pertukaran token tautan email (PKCE/implicit, konvensi @supabase/ssr via middleware) harus menghasilkan SESI sebelum `/reset/confirm` tampil, karena form di sana hanya memanggil `updatePassword(formData)`.
  - Tautan "Baca aturan" di banner menunjuk `/rules` — halaman itu belum ada (buat di fase berikutnya atau ubah `rulesHref`).
  - POST-/FASE: setelah login sukses UI melakukan `router.replace("/") + router.refresh()`; pastikan middleware mengarahkan pengguna yang sudah masuk menjauh dari `/login`/`/register`.

- **Asumsi / keputusan**:
  - Kode undangan WAJIB (PRD 4.1: "bisa dimatikan lewat pengaturan") — konstanta `KODE_UNDANGAN_WAJIB = true` di `RegisterForm.tsx`; `needsEmailConfirmation === false` dari backend akan menampilkan layar "Akun berhasil dibuat" (tanpa verifikasi) alih-alih "Cek email".
  - Validasi klien sesuai PRD 21: username `3–20, a-z A-Z 0-9 _`, password minimal 8, konfirmasi harus sama, email format; semua input di-trim sebelum validasi (PRD 20.8). Validasi server tetap penjaga terakhir.
  - Error aksi ditampilkan inline (role="alert") di atas form, memakai `message` dari backend; fallback peta `lib/errors.ts`. Error per-kolom memakai prop `error` milik Input (aria-invalid).
  - `/reset/confirm` mendeteksi tautan kedaluwarsa dari query `?error=`/`?error_description=` dan fragment `#error=...` (hash tidak terlihat server, karena itu dicek via useEffect di client). Komponen TIDAK memanggil supabase.auth — sesuai aturan keras, semua lewat lib/actions.
  - Setelah login sukses diarahkan ke `/` (feed); tidak ada UI logout di fase ini (milik layout main nanti yang memanggil `logout()`).
  - Nama forum "Forum Komunitas" mengikuti metadata layout root Fase 1; logo SVG gelembung inline (tanpa aset/dependensi baru, tanpa lucide-react).
  - `useSearchParams` di `/reset/confirm` dibungkus `<Suspense>` agar prerender statis tidak gagal.

- **Cara memeriksa**: pastikan `lib/actions/auth.ts` dari BACKEND-AGENT sudah ada, lalu `npm run dev` dan buka `http://localhost:3000/login`, `/register`, `/reset`, `/reset/confirm`. Coba submit kosong (muncul pesan validasi PRD 21), coba password < 8, coba konfirmasi beda; alur sukses akan menguji aksi backend. Banner status uji terpisah: render `<AccountStatusBanner status="suspended" suspendedUntil="2026-12-01" reason="spam" />` di halaman mana pun.
