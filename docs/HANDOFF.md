# HANDOFF — catatan serah terima antar agent

Format entri per skill `forum-multi-agent-builder` bagian 5. Selama fase berjalan, tiap agent menulis entri di `docs/handoff/FASE<N>-<AGENT>.md` (untuk menghindari konflik tulis paralel); ORCHESTRATOR menggabungkannya ke berkas ini di akhir fase.

---
 
# FASE 1 — DB-AGENT

## [FASE 1] DB-AGENT -> ORCHESTRATOR
- Selesai: 4 migrasi Supabase berurutan (skema, fungsi/trigger/RPC, RLS+storage, seed) + 1 file uji RLS manual (10 skenario), semua disalin setia dari PRD bagian 8, 9, 16, 17.
- File yang dibuat/diubah:
  - supabase/migrations/0001_schema.sql
  - supabase/migrations/0002_functions_triggers.sql
  - supabase/migrations/0003_rls_storage.sql
  - supabase/migrations/0004_seed.sql
  - supabase/tests/rls_checks.sql
  - docs/handoff/FASE1-DB.md (file ini)
- Kontrak yang disediakan:
  - Tabel: `profiles` (profil+role member/moderator/admin, status), `invite_codes` (kode undangan, used_count dikelola trigger), `communities` + `community_members`, `posts` (score/comment_count/is_hidden/is_deleted), `post_images` (storage_path), `comments` (thread depth<=3), `votes` (PK user+target, value -1/1), `reports` (auto-hide 3 laporan), `mod_actions` (log moderasi), `app_settings` (key-value jsonb).
  - View: `posts_feed` — satu-satunya cara klien membaca post; menyembunyikan author_id/username/avatar untuk post anonim, memfilter is_hidden/is_deleted, menyertakan `is_mine` dan `my_vote`. `comments_view` — komentar untuk klien; baris terhapus/tersembunyi tampil sebagai `is_removed=true` dengan body/author null.
  - RPC: `get_feed(p_community, p_sort 'new'|'hot', p_limit<=50, p_offset, p_only_joined)` untuk feed; `mod_apply_action(p_action, p_target_type, p_target_id, p_reason, p_days)` untuk semua aksi moderasi (selalu mencatat mod_actions); `mod_dismiss_reports(p_target_type, p_target_id)`.
  - Helper: `is_moderator()`, `is_admin()`, `is_active_user()`, `can_upload()` (akun >= 24 jam untuk upload foto).
  - Trigger otomatis: profil+validasi kode undangan saat signup (`handle_new_user` di auth.users), skor vote, comment_count, auto-hide saat 3 laporan open, rate limit (akun <7 hari: 5 post & 30 komentar/jam; biasa: 20 & 120; moderator/admin bebas), `edited_at` saat post diedit.
  - Storage: bucket publik `post-images` (1 MB, webp/jpeg/png) dan `avatars` (512 KB), path `{user_id}/{uuid}`, upload hanya ke folder sendiri.
- Yang dibutuhkan dari agent lain: tidak ada. Catatan untuk FE/AUTH: saat signup, kirim `username` dan `invite_code` di `raw_user_meta_data` (pengejaan persis); klien TIDAK pernah membaca tabel `posts`/`comments` langsung — hanya `posts_feed`/`comments_view`/`get_feed`; penulis menghapus post sendiri dengan `update posts set is_deleted = true`; upload foto ke path `{user_id}/{uuid}.webp` lalu insert `post_images`. Job pembersihan file storage saat post dihapus ada di sisi app/cron (bukan migrasi).
- Asumsi / keputusan:
  - Bug PRD: tidak ditemukan bug yang membuat SQL PRD tidak bisa jalan — SQL bagian 16 disalin apa adanya. Perubahan yang dilakukan (semua tercatat sebagai komentar "PENGUATAN"/"Catatan" di file):
    1. Tabel `app_settings` (PRD 16.1) dipindah ke 0001 dan baris seed-nya ke 0004 — hanya urutan, tanpa ubah semantik.
    2. (Aturan keras orkestrator; PRD tidak membatasi) `reports`: insert dibatasi kolom `(reporter_id, target_type, target_id, reason, note)` — klien tidak bisa mengisi `status`; update/delete di-revoke. `invite_codes`: insert dibatasi `(code, created_by, max_uses, expires_at)`, update hanya `(max_uses, expires_at)` — klien tidak bisa mengisi `used_count` (hanya trigger `handle_new_user`, security definer). RPC moderasi tidak terpengaruh (security definer).
    3. `revoke select` pada `posts_feed`/`comments_view` dan `revoke execute` pada `get_feed` dari role `anon` — default privilege Supabase otomatis memberi grant ke anon, padahal PRD hanya mengizinkan `authenticated` (akses via undangan).
    4. Seed `app_settings`, seed komunitas, dan insert bucket memakai `on conflict do nothing` agar aman dijalankan ulang manual di SQL Editor.
    5. PRD memakai CHECK constraint, bukan tipe ENUM — diikuti.
    6. Slug 5 komunitas awal (umum, curhat, jual-beli, teknologi, hobi) dan deskripsinya dipilih sendiri — PRD hanya menyebut namanya (contoh PRD memakai `c/umum`).
    7. View sengaja dibuat dengan default `security_invoker = false` — klien tidak diberi SELECT tabel mentah, feed butuh eksekusi hak pemilik. Jangan diubah ke `security_invoker = true`.
  - Risiko terbuka (tidak diubah, sesuai PRD): `mod_actions.moderator_id` dan `invite_codes.created_by` tanpa ON DELETE CASCADE → menghapus pengguna yang punya jejak moderasi/invite gagal sampai baris terkait dibersihkan (terlihat saat menyusun cleanup di file uji); username duplikat saat signup memunculkan error unique generik (bukan kode `USERNAME_INVALID`); vote pada post yang sudah hidden/deleted tidak diblokir trigger (RLS saja).
- Cara memeriksa:
  1. Project Supabase baru/kosong. Di SQL Editor jalankan berurutan: `0001_schema.sql` → `0002_functions_triggers.sql` → `0003_rls_storage.sql` → `0004_seed.sql` (atau `supabase db push` bila CLI terpasang).
  2. Jalankan `supabase/tests/rls_checks.sql` di SQL Editor; lihat tab Messages: 10 skenario harus terbaca "OK S1..S10" (S9 punya 3 sub-cek), tidak boleh ada "GAGAL".
  3. Verifikasi manual cepat: buat akun pertama via aplikasi/daftar → profil otomatis `role='admin'`; akun kedua tanpa kode undangan harus gagal dengan error `INVITE_INVALID`; 5 komunitas awal terlihat di tabel `communities`.
 
## [FASE 1] BACKEND-AGENT -> ORCHESTRATOR

- Selesai: scaffold Next.js 15 App Router tanpa create-next-app — package.json (next ^15.5.4, react ^19, TS ^5, Tailwind ^3.4.14 + postcss ^8.4 + autoprefixer ^10), tsconfig strict + alias @/*, next.config.ts, postcss.config.mjs (format v3), .gitignore, .env.local (nama variabel persis PRD 23.2, placeholder berkomentar), middleware.ts sesi Supabase (pola updateSession, matcher non-statis), lib/supabase client/server/middleware (env lazy, tidak throw saat import, cookies async Next 15), lib/errors.ts (union kode + peta pesan Indonesia PRD 20 + ekstraksi "(CODE) detail"), lib/actions/index.ts placeholder Fase 2-3.
- File yang dibuat/diubah:
  - package.json
  - tsconfig.json
  - next.config.ts
  - postcss.config.mjs
  - .gitignore
  - .env.local
  - middleware.ts
  - lib/supabase/client.ts
  - lib/supabase/server.ts
  - lib/supabase/middleware.ts
  - lib/errors.ts
  - lib/actions/index.ts
- Kontrak yang disediakan:
  - lib/supabase/client.ts → `createClient(): SupabaseClient` — klien browser (createBrowserClient, singleton per tab); env dibaca lazy; throw hanya bila dipanggil tanpa env.
  - lib/supabase/server.ts → `createClient(): Promise<SupabaseClient>` — klien Server Component/Action/Route Handler, cookies() async Next 15, RLS aktif; env lazy.
  - lib/supabase/middleware.ts → `updateSession(request): Promise<UpdateSessionResult>` dengan `UpdateSessionResult = { response: NextResponse; user: User | null }` — refresh cookie sesi; tidak pernah throw.
  - middleware.ts → `middleware(request): Promise<NextResponse>` (return `response` dari updateSession) + `config.matcher` yang mengecualikan _next/static, _next/image, favicon, gambar, font, aset publik; tanpa redirect paksa.
  - lib/errors.ts → `ErrorCode` (union 13 kode), `ERROR_MESSAGES: Record<ErrorCode, string>`, `interface AppError { code: ErrorCode; message: string }`, `appError(code): AppError`, `isErrorCode(v): v is ErrorCode`, `extractErrorCode(error: unknown): AppError` (deteksi "(CODE) detail", prefix "CODE ...", SQLSTATE 42501 / row-level security → RLS_DENIED, ciri jaringan → NETWORK, sisanya UNKNOWN).
  - lib/actions/index.ts → hanya komentar panduan (export {}); aksi Fase 2-3: auth.ts, posts.ts, comments.ts, votes.ts, reports.ts, admin.ts.
- Yang dibutuhkan dari agent lain: kredensial Supabase asli dari user (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, NEXT_PUBLIC_SITE_URL) untuk mengganti placeholder di .env.local; FRONTEND-AGENT memakai createClient dari lib/supabase dan extractErrorCode dari lib/errors.ts; DB-AGENT wajib melempar error database dengan format `(KODE) detail` via `raise exception` agar extractErrorCode mengenalinya (kode persis sesuai tabel PRD 20).
- Asumsi / keputusan: tailwindcss/postcss/autoprefixer diletakkan di dependencies sesuai instruksi orchestrator (bukan devDependencies); ACTION_INVALID dan NOT_FOUND dari kontrak PRD 24 ikut masuk union ErrorCode dengan pesan buatan (tidak ada di tabel PRD 20), demikian pula pesan UNKNOWN; tanpa app/ untuk sementara, `npm run build` belum menghasilkan halaman — build valid setelah FRONTEND-AGENT menambahkan app/layout.tsx + app/page.tsx; tidak membuat klien service-role (PRD 24: hanya cron, dibuat saat Fase /api/cron/cleanup); .gitignore menutup .env dan .env*.local sehingga .env.local tidak akan ter-commit.
- Cara memeriksa: npm install lalu npm run build
 
## [FASE 1] FRONTEND-AGENT -> ORCHESTRATOR
- Selesai: kerangka UI dasar mobile-first — layout root (lang="id", metadata, container max-w), tema warna terang/gelap otomatis mengikuti sistem (prefers-color-scheme) sesuai PRD 22.5, konfigurasi Tailwind CSS v3.4 (direktif klasik), halaman Beranda placeholder (header + tombol Masuk nonaktif + EmptyState feed), dan kit komponen UI dasar lengkap di components/ui (9 komponen, TypeScript, tanpa dependensi tambahan).
- File yang dibuat/diubah: app/layout.tsx, app/globals.css, tailwind.config.ts, app/page.tsx, components/ui/Button.tsx, components/ui/Input.tsx, components/ui/Textarea.tsx, components/ui/Card.tsx, components/ui/Badge.tsx, components/ui/Avatar.tsx, components/ui/Spinner.tsx, components/ui/EmptyState.tsx, components/ui/ErrorState.tsx, docs/handoff/FASE1-FRONTEND.md
- Kontrak yang disediakan:
  - Button: `variant?: "primary"|"secondary"|"danger"` (default primary), `size?: "sm"|"md"|"lg"` (default md, tinggi 44 px), `loading?: boolean` (Spinner + disable otomatis), type default "button", mewarisi semua props `<button>` (termasuk ref).
  - Input: `label?: string`, `error?: string` (teks merah + aria-invalid), sisa props `<input>`; id default dari `name`; tinggi 44 px.
  - Textarea: `label?: string`, `error?: string`, sisa props `<textarea>`; id default dari `name`.
  - Card: `padded?: boolean` (default true), sisa props `<div>`; latar card + border + rounded-xl.
  - Badge: `variant?: "neutral"|"primary"|"success"|"warning"|"danger"` (default neutral), sisa props `<span>`.
  - Avatar: `name: string` (wajib — sumber inisial/alt/warna), `src?: string|null` (tanpa gambar -> inisial dengan warna deterministik dari nama), `size?: "sm"|"md"|"lg"` (default md).
  - Spinner: `size?: "sm"|"md"|"lg"` (default md), `label?: string` (aria, default "Memuat"); warna mengikuti currentColor.
  - EmptyState: `title: string` (wajib), `description?: string`, `icon?: ReactNode` (default ikon inbox SVG inline), `action?: ReactNode`.
  - ErrorState: `title?: string`, `message?: string`, `onRetry?: () => void` (bila ada -> tombol "Coba lagi").
- Yang dibutuhkan dari agent lain: package.json dari BACKEND-AGENT harus memakai tailwindcss ^3.4 + postcss + autoprefixer (globals.css sudah memakai direktif klasik @tailwind — JANGAN tailwind v4), postcss.config.mjs standar Next+Tailwind, dan tsconfig.json dengan path alias "@/*". Tidak ada yang lain.
- Asumsi / keputusan:
  - Warna aksen tunggal: biru (terang HSL 221 83% 53%, gelap 217 91% 64%); mode gelap otomatis via media query prefers-color-scheme sesuai PRD 22.5, tanpa class toggle dan tanpa plugin.
  - Variabel CSS disimpan sebagai triplet HSL + `hsl(var(...) / <alpha-value>)` di tailwind.config.ts agar modifier opasitas (mis. bg-primary/10) bekerja.
  - Tanpa dependensi tambahan: ikon SVG inline gaya lucide, font stack sistem (tanpa next/font agar build tidak bergantung jaringan), Avatar memakai `<img>` biasa (ganti next/image nanti bila perlu).
  - Tidak ada 'use client' di seluruh kit UI (semua komponen tanpa state internal); konsekuensinya: ErrorState.onRetry dan onClick pada komponen UI hanya boleh dipakai dari Client Component (Fase 2-3).
  - tailwind.config.ts content: app + components + lib (glob lib defensif; tidak mengubah file lib milik BACKEND-AGENT).
  - Rute /(main), /login, /submit, dst. sengaja belum dibuat (Fase 2-3); container max-w-5xl di layout root untuk mengakomodasi sidebar di layar lebar.
- Cara memeriksa: npm run dev lalu buka http://localhost:3000
 
# FASE 2 — BACKEND-AGENT (Akun)

## [FASE 2] BACKEND-AGENT -> ORCHESTRATOR / FRONTEND-AGENT

- Selesai: server actions autentikasi lengkap di lib/actions/auth.ts — register (signUp + metadata username/invite_code untuk trigger DB), login (signInWithPassword + cek status profil suspended/banned), logout (signOut + redirect), requestPasswordReset (resetPasswordForEmail + redirectTo dari NEXT_PUBLIC_SITE_URL), updatePassword (updateUser untuk halaman reset dan /settings), getSessionUser (user + profil untuk halaman server). Kode error baru untuk alur auth ditambahkan ke lib/errors.ts. Semua env dibaca lazy — `npm run build` tetap lulus tanpa kredensial asli.
- File yang dibuat/diubah:
  - lib/actions/auth.ts (baru)
  - lib/errors.ts (diubah: +10 kode pada union `ErrorCode` dan `ERROR_MESSAGES`; helper lama tidak berubah)
  - docs/handoff/FASE2-BACKEND.md (file ini)
- Kontrak yang disediakan:

  Tanda tangan aksi (semua di lib/actions/auth.ts, file "use server"):
  ```ts
  register(formData: FormData): Promise<RegisterResult>
  login(formData: FormData): Promise<LoginResult>
  logout(): Promise<void> // selalu redirect ke "/"
  requestPasswordReset(formData: FormData): Promise<RequestPasswordResetResult>
  updatePassword(formData: FormData): Promise<UpdatePasswordResult>
  getSessionUser(): Promise<SessionProfile | null> // untuk halaman server
  ```

  Bentuk hasil (gagal selalu konsisten): `{ ok: false; code: ErrorCode; message: string }`.
  ```ts
  // register — field FormData: email, username, password, invite_code (opsional)
  type RegisterResult =
    | { ok: true; needsEmailConfirmation: boolean } // true → tampil "Cek emailmu" (PRD 19)
    | { ok: false; code: ErrorCode; message: string };

  // login — field FormData: email, password
  type LoginResult =
    | { ok: true; user: SessionProfile }
    | { ok: false; code: ErrorCode; message: string };

  // requestPasswordReset — field FormData: email
  type RequestPasswordResetResult =
    | { ok: true; message: string } // message SELALU netral, tidak bocor (PRD 19)
    | { ok: false; code: ErrorCode; message: string };

  // updatePassword — field FormData: password, confirm_password (opsional)
  type UpdatePasswordResult = { ok: true } | { ok: false; code: ErrorCode; message: string };
  ```

  ```ts
  interface SessionProfile {
    id: string;
    email: string | null;
    username: string;
    role: "member" | "moderator" | "admin";
    status: "active" | "suspended" | "banned"; // untuk banner PRD 18.1.6-7
    suspendedUntil: string | null; // ISO, terisi saat suspended
    avatarUrl: string | null;
    bio: string | null;
  }
  ```

  Kode error per aksi:
  - register: EMAIL_INVALID, USERNAME_INVALID, PASSWORD_WEAK (validasi cepat PRD 21) lalu dari auth/trigger: EMAIL_TAKEN, USERNAME_TAKEN, INVITE_INVALID, USERNAME_INVALID, RATE_LIMIT, NETWORK, UNKNOWN.
  - login: EMAIL_INVALID, LOGIN_INVALID, EMAIL_NOT_CONFIRMED, RATE_LIMIT (jeda 1 menit ditangani Supabase), ACCOUNT_SUSPENDED (tanggal sanksi di-embed di message), ACCOUNT_BANNED, NETWORK, UNKNOWN.
  - requestPasswordReset: EMAIL_INVALID, NETWORK, UNKNOWN; selain itu selalu sukses netral.
  - updatePassword: PASSWORD_WEAK, PASSWORD_MISMATCH, FORBIDDEN (tanpa sesi recovery), PASSWORD_SAME, NETWORK, UNKNOWN.

  Konstanta untuk FE: path halaman reset adalah `/reset-password` (redirectTo = `NEXT_PUBLIC_SITE_URL` + `/reset-password`, env dibaca lazy; bila env kosong, reset tetap dikirim tanpa redirectTo).

- Yang dibutuhkan dari agent lain:
  - FRONTEND-AGENT: halaman + form yang memanggil aksi di atas dengan NAMA FIELD PERSIS di kontrak (email, username, password, invite_code, confirm_password). invite_code boleh kosong — pendaftar pertama memang tanpa kode (PRD 16.2).
  - FRONTEND-AGENT: halaman `/reset-password` — tautan reset mendarat di sana; klien browser (lib/supabase/client.ts, flow PKCE + detectSessionInUrl bawaan) menukar `?code=` menjadi sesi otomatis saat init; setelah itu form memanggil updatePassword().
  - FRONTEND-AGENT: saat hasil login EMAIL_NOT_CONFIRMED, tampilkan halaman/CTA "cek email" dengan kirim-ulang verifikasi (supabase.auth.resend dari klien browser). Saat ACCOUNT_SUSPENDED/ACCOUNT_BANNED tampilkan halaman pesan (message sudah memuat tanggal untuk suspended); untuk info banding banned pakai teks sendiri.
  - FRONTEND-AGENT: banner suspended/banned DI TENGAH sesi (PRD 18.1.6-7, PRD 20 kasus tepi 2) dibaca lewat getSessionUser() di layout/halaman server — status bisa berubah kapan saja.
  - ORCHESTRATOR/USER: env asli (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL) tetap dibutuhkan agar alur nyata jalan.
- Asumsi / keputusan:
  1. lib/errors.ts ditambah 10 kode yang TIDAK ada di tabel PRD 20, semuanya perlu untuk alur PRD 19/21/24: LOGIN_INVALID, EMAIL_NOT_CONFIRMED, ACCOUNT_SUSPENDED, ACCOUNT_BANNED (PRD 19 + 18.1.4-7), EMAIL_INVALID, EMAIL_TAKEN (PRD 24 kontrak signUp "email sudah terdaftar"), USERNAME_TAKEN (PRD 18.1.3; sekaligus menutup risiko terbuka DB-AGENT soal unique violation generik — dideteksi dari 23505/"duplicate key" + "username"), PASSWORD_WEAK (PRD 21), PASSWORD_MISMATCH, PASSWORD_SAME.
  2. PRD 18.1.4 menyebut user belum verifikasi "bisa login tetapi hanya bisa membaca", tetapi bila konfirmasi email aktif, Supabase menolak signIn (email_not_confirmed). Dipetakan ke EMAIL_NOT_CONFIRMED agar FE menampilkan alur cek-email/kirim-ulang. Alternatifnya admin menonaktifkan konfirmasi email di dashboard — maka needsEmailConfirmation=false dan batasan tulis tetap dijaga RLS `is_active_user()`.
  3. Login MENOLAK sesi akun suspended/banned (sesi langsung di-signOut lalu kode ACCOUNT_SUSPENDED/ACCOUNT_BANNED dikembalikan). Banner in-app PRD 18.1.6-7 tetap berlaku untuk suspend/ban yang terjadi DI TENGAH sesi via getSessionUser().
  4. needsEmailConfirmation ditentukan dari `session === null` setelah signUp — jika konfirmasi email dimatikan, sesi langsung terbentuk (cookie ter-set oleh aksi) dan nilainya false.
  5. Logout diarahkan ke "/" sesuai instruksi Fase 2 (PRD 18.1.8 hanya mensyaratkan halaman terproteksi → /login).
  6. requestPasswordReset selalu mengembalikan sukses netral untuk email apa pun (GoTrue tidak membocorkan keberadaan email) — sesuai PRD 19.
  7. Pemetaan error trigger signup (INVITE_INVALID/USERNAME_INVALID dari raise exception) mengandalkan message GoTrue yang meneruskan pesan error DB; sebagian versi GoTrue menyamarkannya menjadi "Database error saving new user" (hasil UNKNOWN). extractErrorCode tetap mengenali bentuk "(KODE) ..." maupun prefiks "KODE ..." bila lolos. Risiko dicatat, tidak ada workaround server-side tambahan.
  8. getSessionUser() tidak pernah melempar: profil gagal dibaca (RLS/jaringan) dianggap hilang → fallback member/active dan username dari user_metadata, supaya halaman tidak crash; null berarti benar-benar belum login.
  9. Tidak menyentuh app/**, components/**, supabase/**, middleware.ts, docs/PROGRESS.md; lib/supabase/server.ts tidak diubah (memang sudah sesuai). Tidak ada klien service-role.
- Cara memeriksa:
  1. `npm run build` harus lulus tanpa env asli (env lazy, tidak ada import yang throw).
  2. Dengan env asli + migrasi Fase 1: daftar akun PERTAMA tanpa kode → sukses, needsEmailConfirmation=true, profil otomatis role=admin; login sebelum verifikasi → EMAIL_NOT_CONFIRMED.
  3. Daftar akun kedua: tanpa kode / kode habis / kode kedaluwarsa → INVITE_INVALID; username format salah → USERNAME_INVALID; username duplikat → USERNAME_TAKEN; email duplikat → EMAIL_TAKEN; password < 8 → PASSWORD_WEAK.
  4. Login: password salah → LOGIN_INVALID; 5x gagal → RATE_LIMIT (jeda 1 menit dari Supabase).
  5. Suspend/banned manual via SQL (`update profiles set status='suspended' ...`) → login → ACCOUNT_SUSPENDED (message memuat tanggal) / ACCOUNT_BANNED, dan sesi tidak tertinggal.
  6. Lupa password → email berisi tautan ke {NEXT_PUBLIC_SITE_URL}/reset-password → buka tautan → updatePassword(password, confirm_password) → ok → login dengan password baru berhasil.
  7. getSessionUser() di Server Component: null saat anonim; objek lengkap saat login; status terbaca ulang tiap request (basis banner).
 
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
 
# FASE 3 — BACKEND-AGENT (Inti forum)

## [FASE 3] BACKEND-AGENT -> ORCHESTRATOR / FRONTEND-AGENT

- Selesai: server actions inti forum di lib/actions/{communities,posts,comments,votes}.ts sesuai kontrak PRD 24 — feed (RPC `get_feed` + view `posts_feed` dengan pagination kursor dan filter komunitas/penulis/pencarian), detail post (posts_feed + comments_view), buat/edit/hapus post (soft delete), buat/hapus komentar (validasi parent/depth/rate-limit diserahkan ke trigger DB), vote post & komentar (upsert/delete `votes`, mengembalikan skor terbaru), gabung/keluar komunitas, daftar & detail komunitas. Semua bacaan post/komentar HANYA lewat view `posts_feed`/`comments_view`/RPC `get_feed` (aturan keras); post anonim tidak membocorkan penulis (view menyamarkan, `is_mine` tetap benar bagi penulisnya); klien tidak pernah menulis score/is_hidden (diisi trigger DB).
- File yang dibuat/diubah:
  - lib/actions/communities.ts (baru)
  - lib/actions/posts.ts (baru)
  - lib/actions/comments.ts (baru)
  - lib/actions/votes.ts (baru)
  - lib/actions/comment-tree.ts (baru — helper murni, bukan action)
  - lib/actions/validate.ts (baru — helper murni validasi PRD 21)
  - lib/errors.ts (diubah: +5 kode pada union `ErrorCode` + `ERROR_MESSAGES`; + tipe `ActionResult<T>`; helper lama tidak berubah)
  - lib/actions/index.ts (diubah: hanya komentar dokumentasi daftar modul)
  - docs/handoff/FASE3-BACKEND.md (file ini)
  - TIDAK diubah: lib/actions/auth.ts, lib/supabase/*, app/**, components/**, supabase/**, middleware.ts, docs/PROGRESS.md.
- Kontrak yang disediakan (semua file action "use server"; hasil gagal selalu `{ ok: false; code: ErrorCode; message: string }` — type `ActionResult<T>` dari lib/errors.ts):

  ```ts
  // ================= lib/actions/communities.ts =================
  interface CommunitySummary {
    id: string; slug: string; name: string; description: string | null;
    created_at: string;
    memberCount: number | null; // SELALU null di Fase 1-3 (lihat asumsi 4)
    postCount: number | null;   // SELALU null di Fase 1-3
    isJoined: boolean;          // status keanggotaan user sesi
  }
  getCommunities(): Promise<ActionResult<{ communities: CommunitySummary[] }>>
    // urut nama asc. PRD 24 tidak mendefinisikan aksi list — mengikuti PRD 4.2/18.2.1.
  getCommunityBySlug(slug: string): Promise<ActionResult<{ community: CommunitySummary }>>
  joinCommunity(communityId: string): Promise<ActionResult<{ joined: boolean }>>   // PRD 24; idempoten
  leaveCommunity(communityId: string): Promise<ActionResult<{ joined: boolean }>>  // PRD 24; idempoten

  // ================= lib/actions/posts.ts =================
  type FeedSort = "new" | "hot";
  interface FeedPost { // kolom PERSIS view posts_feed (snake_case, PRD 16.7)
    id: string; community_id: string; title: string; body: string | null;
    score: number; comment_count: number; is_anonymous: boolean;
    created_at: string; edited_at: string | null;
    author_id: string | null;       // null utk post anonim — JANGAN dipakai tampil
    author_username: string | null; // null utk post anonim → tampilkan "Anonim"
    author_avatar: string | null;
    is_mine: boolean;               // true bagi penulis, termasuk post anonimnya
    my_vote: -1 | 0 | 1 | null;
  }
  interface GetFeedParams {
    cursor?: string;          // opaque, dari data.nextCursor; filter WAJIB dikirim ulang sama
    communitySlug?: string;   // halaman /c/[slug]
    username?: string;        // halaman profil; post anonim otomatis tersaring
    search?: string;          // ilike di judul+isi
    sort?: FeedSort;          // default "new"
    onlyJoined?: boolean;     // PRD 24 "hanya yang diikuti?" (default false)
    limit?: number;           // default 20, maks 50 (batas RPC get_feed)
  }
  interface FeedData { posts: FeedPost[]; nextCursor: string | null; }
  getFeed(params?: GetFeedParams): Promise<ActionResult<FeedData>> // PRD 24 getFeed
  interface CommentItem { // kolom PERSIS view comments_view (snake_case, PRD 16.7)
    id: string; post_id: string; parent_id: string | null; depth: number;
    score: number; created_at: string; is_removed: boolean;
    body: string | null; author_id: string | null; author_username: string | null;
    author_avatar: string | null; is_mine: boolean; my_vote: -1 | 0 | 1 | null;
  }
  interface PostDetailData { post: FeedPost; comments: CommentItem[]; }
  getPost(id: string): Promise<ActionResult<PostDetailData>> // PRD 24 getPost + getComments
  interface CreatePostInput { communityId?: string; communitySlug?: string; title: string;
    body?: string; isAnonymous?: boolean; }
  createPost(input: CreatePostInput): Promise<ActionResult<{ id: string }>> // PRD 24 createPost (tanpa foto)
  interface EditPostInput { id: string; title: string; body: string; }
  editPost(input: EditPostInput): Promise<ActionResult<{ id: string }>>     // PRD 24 editPost
  deletePost(id: string): Promise<ActionResult<{ id: string }>>             // PRD 24 deletePost (soft delete)

  // ================= lib/actions/comment-tree.ts (BUKAN action — boleh di client) =================
  interface CommentNode extends CommentItem { replies: CommentNode[]; }
  buildCommentTree(comments: CommentItem[]): CommentNode[]
    // is_removed tetap masuk pohon → render "[komentar dihapus]" (PRD 18.4.3);
    // urutan per tingkat: skor desc, lalu waktu terlama (PRD 18.4.5).

  // ================= lib/actions/comments.ts =================
  interface CreateCommentInput { postId: string; parentId?: string; body: string; }
  interface NewComment { id: string; post_id: string; parent_id: string | null;
    depth: number; body: string; created_at: string; }
  createComment(input: CreateCommentInput): Promise<ActionResult<{ comment: NewComment }>> // PRD 24
  deleteComment(id: string): Promise<ActionResult<{ id: string }>>  // PRD 24 (soft delete)
  // editComment TIDAK disediakan — tidak ada di PRD 24/4.4.

  // ================= lib/actions/votes.ts =================
  type VoteTargetType = "post" | "comment";
  type VoteValue = -1 | 0 | 1;
  interface VoteState { score: number | null; myVote: VoteValue | null; }
    // score null = target sudah tidak terlihat (hapus/sembunyi) → UI pakai nilai optimistic.
  setVote(targetType: VoteTargetType, targetId: string, value: VoteValue): Promise<ActionResult<VoteState>> // PRD 24 setVote
  setVotePost(postId: string, value: VoteValue): Promise<ActionResult<VoteState>>      // wrapper
  setVoteComment(commentId: string, value: VoteValue): Promise<ActionResult<VoteState>> // wrapper
  // value 0 = tarik suara (delete); ±1 = upsert. Klik panah lawan saat sudah vote = ganti nilai (PRD 18.5.1).
  ```

  Kode error per aksi:
  - Semua aksi: `LOGIN_REQUIRED` bila belum login; `NETWORK` / `UNKNOWN` dari extractErrorCode; `RLS_DENIED` saat DB menolak (akun suspended/banned — PRD 20 kasus tepi 2; UI diminta menampilkan banner via getSessionUser()).
  - getFeed: NOT_FOUND (slug komunitas tidak ada).
  - getPost: NOT_FOUND (id salah ATAU post hidden/deleted — sama-sama tidak ada di view, PRD 24 "tidak ditemukan").
  - createPost/editPost: TITLE_INVALID, BODY_TOO_LONG (validasi cepat PRD 21), NOT_FOUND (komunitas tidak ada), RATE_LIMIT, RLS_DENIED.
  - deletePost: NOT_FOUND / FORBIDDEN / RLS_DENIED (lihat asumsi 6).
  - createComment: COMMENT_BODY_INVALID (PRD 21), POST_UNAVAILABLE (post tidak terlihat — termasuk dihapus saat orang lain menulis, PRD 20 kasus tepi 1), PARENT_INVALID, PARENT_UNAVAILABLE, DEPTH_EXCEEDED, RATE_LIMIT, NOT_FOUND (postId kosong).
  - deleteComment: NOT_FOUND / FORBIDDEN / RLS_DENIED (pola sama dengan deletePost).
  - setVote*: VOTE_INVALID (tipe/nilai salah), RLS_DENIED (suspended — PRD 18.5.4).
  - joinCommunity/leaveCommunity: NOT_FOUND (community id salah), RLS_DENIED (suspended saat join).
  - getCommunities/getCommunityBySlug: NOT_FOUND (slug tidak ada).

- Yang dibutuhkan dari agent lain:
  - FRONTEND-AGENT: cukup impor dari lib/actions/* (tipe `FeedPost`/`CommentItem` dari posts.ts; `buildCommentTree` dari comment-tree.ts — file murni, aman untuk Client Component). Nama field hasil view SENGAJA snake_case persis DB — jangan mengharapkan camelCase.
  - FRONTEND-AGENT: pagination kursor = kirim `nextCursor` ke `getFeed` pada request berikutnya dengan FILTER YANG SAMA PERSIS (cursor hanya menyimpan offset). `nextCursor === null` berarti halaman terakhir. Feed kosong/onlyJoined tanpa keanggotaan = array kosong + `nextCursor: null` (bukan error) → render empty state + ajakan (PRD 20 kasus tepi 10, PRD 18.2.1).
  - FRONTEND-AGENT: vote = optimistic update lalu setVotePost/setVoteComment; bila ok, ganti skor dengan `data.score` (PRD 18.5.2); bila gagal, kembalikan tampilan semula. `myVote: null` berarti panah tidak aktif. Kedalaman 3 → sembunyikan tombol Balas (PRD 18.4.2, field `depth`).
  - FRONTEND-AGENT: form post kirim `title`, `body` (bukan "content"), `isAnonymous`, dan `communityId` ATAU `communitySlug`. `body` boleh kosong (skema membolehkan null) tapi UI disarankan mewajibkan sesuai PRD 4.3.
  - ORCHESTRATOR/DB-AGENT (Fase 4): (a) view statistik komunitas (jumlah anggota/post) agar halaman /c/[slug] & daftar komunitas bisa menampilkan angka (PRD 18.2.3) — sementara `memberCount`/`postCount` selalu null; (b) aksi `getPostImages` + upload (PRD 24) dan batasan foto akun <24 jam (PRD 18.3.10, helper DB `can_upload()` sudah ada); (c) aksi `report`/`modAction`/`getReports`/`createInvite` (PRD 24) untuk moderasi.
- Asumsi / keputusan:
  1. lib/errors.ts ditambah 5 kode yang tidak ada di tabel PRD 20, pola yang sama dengan tambahan Fase 2: LOGIN_REQUIRED (sesi belum ada — lebih jelas bagi FE daripada menunggu RLS menolak), TITLE_INVALID, BODY_TOO_LONG, COMMENT_BODY_INVALID (validasi cepat PRD 21 di app), VOTE_INVALID (guard tipe/nilai setVote). Plus tipe generik `ActionResult<T>` untuk bentuk hasil konsisten PRD 24.
  2. Kontrak `setVote` PRD 24 (`tipe, id, nilai`) diikuti persis; wrapper `setVotePost`/`setVoteComment` (permintaan orkestrator "setVote(postId, value)") hanyalah pintu nyaman — FE bebas memakai salah satu, keduanya mengembalikan `VoteState`.
  3. `getFeed` memakai objek parameter (bukan posisi) karena banyak opsi opsional; nama & makna mengikuti PRD 24 (komunitas?, sort, halaman→cursor, hanya yang diikuti?) plus cursor/username/search yang diminta orkestrator. RPC `get_feed` dipakai untuk jalur tanpa filter username/search; jalur berfilter membaca view `posts_feed` langsung (tetap aturan keras — view, bukan tabel mentah).
  4. `memberCount`/`postCount` komunitas selalu null: DB Fase 1 tidak punya view statistik dan RLS `community_members` hanya mengizinkan membaca keanggotaan sendiri (terbaca dari 0003_rls_storage.sql), jadi angka itu TIDAK bisa dihitung klien tanpa melanggar aturan. Dibuat sebagai tipe `number | null` agar kontrak tidak berubah saat DB menambah view.
  5. Sort "hot" pada jalur berfilter (username/search) memakai proksi `score desc, created_at desc` karena rumus populer hanya ada di SQL `get_feed` (butuh umur post). Jalur utama (tanpa filter itu) tetap memakai rumus asli di RPC.
  6. Update yang berdampak 0 baris (RLS menyaring diam-diam) dibedakan dengan satu bacaan view: post/komentar tidak ada → NOT_FOUND; milik sendiri tapi ditolak (mis. status berubah jadi suspended di tengah sesi) → RLS_DENIED; bukan milik → FORBIDDEN. Catatan: RLS update posts/comments HANYA penulis (moderator menyembunyikan lewat RPC `mod_apply_action`, Fase moderasi) — sesuai migrasi 0003.
  7. createComment melakukan pra-cek post via `posts_feed`: tidak terlihat → POST_UNAVAILABLE (bukan NOT_FOUND) agar kasus "post dihapus saat orang lain menulis komentar" (PRD 20 kasus tepi 1) tampil sesuai PRD, dan id fabrikasi tidak bocor keberadaannya. Validasi parent/depth/rate-limit TETAP di trigger DB (penjaga terakhir).
  8. `body` post opsional (tersimpan null bila kosong): skema PRD 8 hanya CHECK panjang maks; PRD 18.3.1 juga hanya menyebut maksimum. UI disarankan tetap mewajibkan isi. Komentar wajib 1–5.000 karakter.
  9. Panjang string divalidasi dengan code point (`[...s].length`) agar mendekati `char_length()` PostgreSQL (aman untuk emoji).
  10. Cursor hanya menyimpan offset (base64url JSON `{o:n}`), tidak menyimpan filter — FE wajib mengirim ulang filter yang sama; cursor rusak/asing diperlakukan offset 0 (aman, bukan error).
  11. Pencarian `search` dibersihkan dari karakter khusus PostgREST `or=` (koma, %, _, kurung) sebelum jadi pola ilike — frasa aneh tetap aman, bukan error.
  12. `getPostImages` dan foto pada createPost sengaja belum ada (instruksi Fase 3: media di Fase 4); kolom `edited_at` dari view dipakai FE untuk label "(diedit)" (PRD 4.3, trigger DB yang mengisi).
  13. lib/actions/index.ts hanya diperbarui komentarnya (daftar modul); tidak ada perubahan kode. lib/supabase/* dan lib/actions/auth.ts tidak disentuh — getSessionUser() dipakai apa adanya untuk sesi.
- Cara memeriksa:
  1. `npm run build` harus lulus tanpa env asli (env dibaca lazy oleh lib/supabase/server.ts; tidak ada akses DB saat build).
  2. Dengan env asli + migrasi Fase 1-2: login, lalu `getCommunities()` → 5 komunitas seed (umum, curhat, jual-beli, teknologi, hobi), `isJoined` false semua.
  3. `joinCommunity(id)` → isJoined true (cek ulang getCommunities); `leaveCommunity(id)` → false. Tanpa login semua aksi mengembalikan LOGIN_REQUIRED.
  4. `createPost({ communitySlug: "umum", title: "Halo", body: "Isi", isAnonymous: true })` → `{ ok:true, data:{ id } }`; judul kosong/201 karakter → TITLE_INVALID; isi >10.000 → BODY_TOO_LONG. Cek di DB: baris posts punya author_id, tapi `getPost(id)` TIDAK menampilkan author_id/username/avatar (anonim) dan `is_mine` true hanya bagi penulisnya.
  5. `getFeed()` halaman pertama → maks 20 post; `getFeed({ cursor: nextCursor })` lanjut tanpa duplikat/lompat; `getFeed({ communitySlug: "teknologi", sort: "hot", onlyJoined: true })`, `getFeed({ username: "budi" })`, `getFeed({ search: "jual" })` masing-masing tersaring; slug tak dikenal → NOT_FOUND.
  6. `createComment({ postId, body })` → komentar depth 0; balas dengan parentId → depth 1; balas komentar depth 3 → DEPTH_EXCEEDED; komentar ke post yang dihapus → POST_UNAVAILABLE; post id acak → POST_UNAVAILABLE; komentar 0/5001 karakter → COMMENT_BODY_INVALID. Hapus post lalu getPost(id) → NOT_FOUND, dan getFeed tidak lagi memuatnya.
  7. `setVotePost(id, 1)` → score +1 & myVote 1; ulang nilai 1 → tetap satu baris votes; ganti ke -1 → score -2 dari kondisi sebelumnya; `setVotePost(id, 0)` → myVote null & skor kembali. Skor final cocok dengan kolom score di DB (trigger apply_vote_delta).
  8. Akun suspended manual via SQL di tengah sesi → createPost/createComment/setVote/joinCommunity → RLS_DENIED (banner via getSessionUser menunjukkan status suspended).
  9. Rate limit (akun <7 hari: 5 post/jam) → post ke-6 dalam 1 jam → RATE_LIMIT dengan pesan ramah PRD 20.
  10. buildCommentTree(getPost(id).comments) → pohon benar walau komentar induk is_removed: anak tetap tergantung pada node "[komentar dihapus]".
 
# FASE 3 — FRONTEND-AGENT (Inti Forum)

## [FASE 3] FRONTEND-AGENT -> ORCHESTRATOR

- **Selesai**: seluruh halaman & komponen inti forum Fase 3 sesuai PRD (bagian 4.3–4.5, 6, 18.2–18.5, 22.1–22.3) — app/page.tsx lama DIHAPUS (beranda pindah ke route group `(main)` sehingga tidak ada dua page untuk "/"), layout inti dengan header (logo teks, nav chip komunitas ringkas, tombol "+ Buat Post") + banner status akun (suspended/banned, PRD 18.1.6-7) + bottom nav mobile, beranda feed dengan tab Terbaru/Populer dan tombol "Muat lagi" (pagination kursor, append tanpa reload), halaman komunitas /c/[slug] (info + jumlah anggota + tombol Gabung/Keluar optimistic + feed komunitas), detail post /p/[id] (konten penuh + VoteButtons optimistic + komentar bertingkat + form komentar/balasan), dan /submit (form buat post: pilih komunitas, judul n/200, isi, checkbox anonim; tanpa upload foto — Fase 4). Semua daftar punya state loading (skeleton/spinner), kosong (EmptyState), dan error (ErrorState + coba lagi). Semua akses data HANYA lewat lib/actions (Server Component memakai pembungkus aman; Client Component memanggil server action langsung) — TIDAK ada pemanggilan Supabase dari komponen. Semua teks user dirender sebagai teks biasa (React default) — TIDAK ada dangerouslySetInnerHTML. Bahasa Indonesia, mobile-first, memakai kit components/ui.

- **File yang dibuat/diubah**:
  - app/page.tsx — DIHAPUS (wajib: mencegah dua route "/" yang bikin `next build` gagal).
  - app/(main)/layout.tsx — header sticky + nav chip komunitas + tombol "+ Buat Post", sesi via getSessionUser (tamu: Masuk/Daftar; user: avatar+username+Keluar via form action logout), AccountStatusBanner, bottom nav mobile (client, usePathname), `export const dynamic = "force-dynamic"` (data per-pengguna).
  - app/(main)/loading.tsx — skeleton kartu post (navigasi antarhalaman).
  - app/(main)/page.tsx — beranda: tab ?urutan=terbaru|populer, panggil getFeed({ sort }) di server, render FeedList.
  - app/(main)/c/[slug]/page.tsx — info komunitas + JoinButton + feed per komunitas.
  - app/(main)/p/[id]/page.tsx — detail post + VoteButtons + CommentTree + CommentForm; label (diedit); ajakan login untuk tamu; vote/komentar dinonaktifkan untuk akun disuspend.
  - app/(main)/submit/page.tsx — cek sesi (tamu → redirect /login), getCommunities → SubmitPostForm.
  - components/PostCard.tsx — kartu post (server-safe, murni): badge c/slug, penulis/Anonim, waktu relatif, judul, cuplikan 2 baris, skor + jumlah komentar; satu Link ke /p/[id].
  - components/VoteButtons.tsx (client) — optimistic update skor, klik ulang = batal (value 0), pulihkan nilai lama saat server menolak (PRD 18.5.1-2); tamu → router.push("/login"); skor terbaru dari hasil setVote dipakai bila ada.
  - components/CommentTree.tsx (client) + components/CommentForm.tsx (client) — komentar bertingkat s.d. kedalaman 3 (Balas disembunyikan di kedalaman 3, PRD 18.4.2), indentasi + garis vertikal (tanpa indentasi tambahan di atas kedalaman 3), komentar terhapus "[komentar dihapus]" abu-abu dengan balasan tetap tampil (PRD 18.4.3); form komentar 1–5.000 karakter, sukses → router.refresh().
  - components/SubmitPostForm.tsx (client) — validasi PRD 21/18.3 (judul wajib 1–200 dengan counter, Kirim nonaktif saat judul kosong; isi wajib maks 10.000; komunitas wajib), checkbox "Posting sebagai anonim", catatan aturan komunitas, sukses → router.replace("/p/[id]").
  - components/feed/types.ts — tipe tampilan longgar + normalizer (camelCase/snake_case, komunitas string|objek, penulis null → Anonim, waktuRelatif id-ID, pesanGagalHasil, bacaCursor, bacaIdDariHasil).
  - components/feed/server-data.ts — pembungkus try/catch untuk Server Component (ambilFeed/ambilDaftarKomunitas/ambilKomunitas/ambilPost/ambilSesi) — env/kredensial hilang tidak melecahkan render, jadi halaman tetap tampil kerangka + state error.
  - components/feed/FeedList.tsx (client) — daftar post + "Muat lagi" (kursor, append), retry, EmptyState/ErrorState/Spinner.
  - components/feed/JoinButton.tsx (client) — Gabung/Keluar optimistic tanpa reload (PRD 18.2.2); tamu → /login.
  - components/feed/FeedSkeleton.tsx, components/feed/BottomNav.tsx (client) — skeleton & bottom nav.
  - docs/handoff/FASE3-FRONTEND.md (file ini). TIDAK menyentuh lib/**, supabase/**, middleware.ts, app/(auth)/**, app/layout.tsx, components/ui/**, docs/PROGRESS.md.

- **Kontrak yang disediakan** (dipakai fase berikutnya):
  - components/feed/types.ts: `FeedPostView`, `PostDetailView`, `CommentView { id, authorName, isRemoved, body, createdAt, score, children }`, `CommunityView { slug, name, description, memberCount, isJoined }` + normalizer `toFeedPosts(hasil)`, `toPostDetail(hasil)`, `toCommentList(sumber)`, `toCommunityViews(hasil)`, `toCommunity(hasil, fallbackSlug)`, helper `waktuRelatif(iso)`, `pesanGagalHasil(hasil)`, `bacaCursor(hasil)`, `bacaIdDariHasil(hasil)`.
  - components/feed/server-data.ts: `ambilFeed({cursor?, communitySlug?, username?, sort?})`, `ambilDaftarKomunitas()`, `ambilKomunitas(slug)`, `ambilPost(id)`, `ambilSesi()` — semua `Promise<HasilAman<T>>` = `{ ok: true, data } | { ok: false, message, code }`.
  - Halaman siap diarahkan: `/` (+ `?urutan=populer`), `/c/[slug]`, `/p/[id]`, `/submit`. Bottom nav "Profil" menunjuk `/u/[username]` (route Fase 4) atau `/login` untuk tamu.
  - FeedList bisa dipakai ulang untuk feed profil: `<FeedList username="..." />` (getFeed({ username })) — siap untuk /u/[username] di Fase 4.

- **Yang dibutuhkan dari agent lain**:
  - BACKEND-AGENT: lib/actions/posts.ts (getFeed, getPost, createPost), communities.ts (getCommunities, getCommunity, joinCommunity, leaveCommunity), comments.ts (createComment), votes.ts (setVote) — sesuai kontrak yang disepakati. Selama file itu belum ada, `next build`/`tsc` error "Cannot find module '@/lib/actions/...'" — itu diharapkan; UI sudah lengkap dan tinggal nyambung.
  - BACKEND-AGENT: getFeed diharapkan menerima argumen `{ cursor?, communitySlug?, username?, search? }` dan MEMBACA properti tambahan `sort: "new" | "hot"` yang saya kirim (dipetakan ke RPC get_feed p_sort) — bila belum, feed selalu Terbaru dan tab Populer hanya mempertahankan state URL; mohon ditambahkan.
  - BACKEND-AGENT: hasil createPost diharapkan memuat id post (data.id / data.post.id) agar redirect ke detail post bekerja; setVote diharapkan mengembalikan skor terbaru (data.score) agar skor disinkronkan setelah optimistic.
  - Fase 4: rute /u/[username], /settings, /rules (tautan "Baca aturan" banner), UI lapor & hapus post/komentar (menu titik tiga di wireframe 22.1-22.2 belum dibuat — kontrak aksinya belum ada di Fase 3), upload foto di /submit, vote komentar (kontrak setVote saat ini hanya post).

- **Asumsi / keputusan**:
  1. Bentuk data longgar: semua field PostFeed/CommentNode/Community dibungkus normalizer di components/feed/types.ts (camelCase & snake_case dibaca; komunitas bisa string slug atau objek; penulis hilang/flag anonim → "Anonim"; angka/tanggal fallback aman). Sesuai instruksi, akses field selalu dengan ?? fallback.
  2. Kredensial Supabase belum ada: semua pemanggilan aksi di Server Component dibungkus try/catch (lib/supabase/server.ts melempar bila env kosong) → halaman tetap build & render dengan ErrorState. `dynamic = "force-dynamic"` di layout (main) mencegah prerender statis (data per-user + menghindari DynamicServerError tertelan try/catch).
  3. Vote: hanya untuk POST di fase ini (kontrak setVote({ postId, value }) memang hanya post); skor di kartu post ditampilkan statis, panah vote hanya di halaman detail. Vote komentar menunggu kontrak (PRD 4.5 menyebutnya — dicatat untuk Fase 4).
  4. Pagination kursor: halaman pertama SSR; "Muat lagi" memanggil server action getFeed dari klien dan MENAMBAHKAN item (bukan navigasi ?cursor=) sesuai pola wireframe; retry mengulang dari awal.
  5. Bottom nav mobile 3 item (Beranda, Buat, Profil/Masuk) — item "Komunitas" wireframe 22.1 digantikan baris chip komunitas di header karena PRD 6 tidak punya halaman indeks komunitas.
  6. Validasi klien /submit: judul wajib 1–200 (Kirim nonaktif saat kosong, PRD 18.3.2) dan isi wajib maks 10.000 — saya memutuskan isi minimal 1 karakter (PRD tidak melarang post tanpa isi, tapi post kosong tanpa foto tidak bermakna; backend tetap penjaga terakhir). Anonim hanya checkbox di post, tidak ada di form komentar (PRD 4.3/4.4).
  7. Setelah komentar/balasan sukses: router.refresh() agar komentar muncul di posisi benar sesuai urutan server (skor tertinggi, lalu waktu terlama, PRD 18.4.5) — urutan TIDAK diurut ulang di klien.
  8. Waktu relatif ("2 jam lalu") dihitung di render; elemen <time> diberi suppressHydrationWarning untuk menghindari warning hidrasi detik-perbedaan antara SSR dan klien.
  9. Menu titik tiga (Lapor / Hapus bila milik sendiri) dan foto di kartu/detail sengaja belum dibuat — aksi lapor/hapus dan post_images belum ada di kontrak Fase 3 (data isMine sudah dinormalkan dan siap dipakai).
  10. Error server action yang melempar (bukan mengembalikan { ok:false }) dimask Next.js di produksi → fallback pesan UNKNOWN "Terjadi kesalahan. Coba lagi."; karena itu UI selalu memeriksa bentuk { ok:false, message } terlebih dahulu (pesanGagalHasil).

- **Cara memeriksa**:
  1. Setelah lib/actions/* dari BACKEND-AGENT ada: `npm run build` (tanpa env asli harus lulus; semua env dibaca lazy dan setiap aksi dibungkus try/catch) lalu `npm run dev`.
  2. `/` — tab Terbaru/Populer, kartu post (badge c/slug, Anonim untuk post anonim, skor, jumlah komentar); tanpa data → EmptyState "Belum ada postingan"; matikan env → ErrorState + tombol Coba lagi.
  3. `/c/umum` — info komunitas + Gabung/Keluar berubah seketika (tamu diarahkan /login); feed komunitas tanpa badge komunitas.
  4. `/p/[id]` — vote klik naik +1, klik lagi kembali, klik turun berubah −2 (PRD 18.5.1); komentar bertingkat, Balas tersembunyi di kedalaman 3, komentar terhapus abu-abu; tamu melihat ajakan Masuk.
  5. `/submit` — tamu dialihkan /login; judul kosong → Kirim nonaktif; judul 201 karakter ditolak; isi >10.000 ditolak; sukses → diarahkan ke detail post.
  6. Cek juga header: tamu (Masuk/Daftar) vs login (avatar+username+Keluar), chip komunitas, dan bottom nav di layar sempit.

# VERIFIKASI GERBANG 1 — ORCHESTRATOR (2026-11-01)

## [GERBANG 1] ORCHESTRATOR -> SEMUA
- Selesai: 4 migrasi diterapkan ke proyek Supabase live user (koneksi session pooler ap-northeast-2; progress tercatat di `private.app_migrations`). Uji RLS `supabase/tests/rls_checks.sql` dijalankan ulang: **17 OK, 0 GAGAL** — termasuk S6 (pemilik edit post sendiri), S8 (moderasi via RPC + post tersembunyi hilang dari feed), S9 (trigger skor vote), S10 (akun suspend tidak bisa menulis).
- Perbaikan berkas uji (bug harness, bukan bug database):
  1. SETUP kini dibungkus `BEGIN..COMMIT` eksplisit. Penyebab: runner/SQL Editor menjalankan seluruh berkas sebagai SATU transaksi implisit, sehingga `ROLLBACK` skenario pertama ikut membatalkan SETUP — gejala palsu: S6 "0 baris" dan S8 `FORBIDDEN`. (Bukti database sehat: trigger `on_auth_user_created` aktif; insert uji manual langsung membuat profil `active`/`member`.)
  2. `rls_mod` diangkat menjadi moderator dalam SETUP (kebutuhan skenario 8 yang sebelumnya terlewat).
- Verifikasi manual tambahan: default kolom `profiles.status='active'`, `role='member'` — alur registrasi di level database sehat.
- Tool baru: `scripts/run-migrations.mjs` (migrasi idempoten + uji RLS), `scripts/exec-sql.mjs` (eksekusi SQL arbitrer). Kredensial SELALU lewat env `SUPA_DB_PASSWORD` — tidak pernah ditulis ke file; `pg` ditambahkan sebagai devDependency.
- Yang dibutuhkan dari agent lain: tidak ada. DEVOPS (Fase 6): ingat set `NEXT_PUBLIC_SITE_URL` saat deploy dan aktifkan SMTP (PRD 23.3) sebelum undang pengguna.
 
# FASE 4 — DB-AGENT

## [FASE 4] DB-AGENT -> ORCHESTRATOR/BACKEND-AGENT
- Selesai: 1 migrasi baru `0005_community_stats.sql` — view statistik komunitas (definer) + grant/revoke mengikuti pola 0003. RPC moderasi target 'user' dicek terhadap PRD 16.6: SUDAH didukung implementasi live 0002, jadi TIDAK ada fungsi baru — hanya komentar hasil pengecekan di dalam file (file tetap wajib ada sesuai instruksi).
- File yang dibuat/diubah:
  - supabase/migrations/0005_community_stats.sql
  - docs/handoff/FASE4-DB.md (file ini)
- Kontrak yang disediakan:
  - View `public.community_stats` — nama kolom PERSIS:
    - `community_id uuid` (id komunitas; satu baris per komunitas, semua komunitas termasuk yang kosong)
    - `member_count bigint` (jumlah baris `community_members` komunitas itu)
    - `post_count bigint` (jumlah post komunitas itu yang TIDAK `is_deleted` dan TIDAK `is_hidden`)
  - View dibuat `security_invoker = false` (definer, disengaja — sama dengan `posts_feed`/`comments_view`): angka terbaca penuh oleh semua `authenticated` tanpa perlu role khusus. JANGAN diubah ke `security_invoker = true` (RLS `community_members`/`posts` akan membuat angka jadi 0/salah untuk user biasa).
  - Hak akses: `grant select on public.community_stats to authenticated;` dan `revoke select ... from anon;` (anon permission denied).
  - RPC moderasi (tidak berubah, sudah live sejak 0002): `mod_apply_action(p_action, p_target_type, p_target_id, p_reason default null, p_days default 3)` mendukung `p_target_type='user'` untuk `suspend` (pakai `p_days`), `ban`, dan `restore` (reaktivasi: status kembali `active`, `suspended_until` null); `hide`/`delete` terhadap user ditolak `ACTION_INVALID`; moderator tidak bisa menindak admin; setiap aksi selalu tercatat di `mod_actions`.
- Yang dibutuhkan dari agent lain:
  - ORCHESTRATOR: terapkan `0005_community_stats.sql` via `scripts/run-migrations.mjs` (urut setelah 0004; file idempoten — `create or replace view` + `alter view ... set`).
  - BACKEND-AGENT: untuk halaman `/c/[slug]` (PRD 18.2.3) dan daftar komunitas, baca angka dari `community_stats` (mis. `.from('community_stats').select('*')` atau filter `.eq('community_id', id)`) — JANGAN menghitung sendiri dari tabel mentah `community_members`/`posts` (RLS akan membatasi). Untuk suspend/ban/reaktivasi user di dashboard admin, panggil RPC `mod_apply_action` yang sudah ada (lihat kontrak di atas); tidak ada RPC baru.
- Asumsi / keputusan:
  - `member_count` = jumlah baris `community_members` (gabung/keluar menambah/menghapus baris — PRD 18.2.2); tidak mengecualikan anggota yang suspended/banned (PRD tidak memintanya).
  - `post_count` mengikuti instruksi orkestrator: tidak `is_deleted` DAN tidak `is_hidden` (PRD 18.2.3 sendiri hanya menyebut "jumlah anggota").
  - View tanpa filter komunitas: komunitas tanpa anggota/post tampil dengan nilai 0, agar daftar komunitas lengkap tanpa join tambahan.
  - Grant/revoke meniru pola 0003: Supabase memberi default privilege SELECT ke `anon` untuk objek baru di schema public, maka dicabut.
  - `security_invoker` adalah opsi PostgreSQL 15+ — aman untuk Supabase saat ini (PG15/16/17); baris `alter view ... set (security_invoker = false)` ada karena `create or replace view` tidak menimpa opsi view yang sudah ada (jaga-jaga bila view sempat dibuat manual saat uji).
  - Bug PRD: tidak ditemukan — SQL PRD 16.6 identik dengan implementasi live 0002 dan sudah mendukung target 'user', sehingga tidak ada fungsi tambahan di 0005 (sesuai instruksi, cukup komentar; file tetap ada karena view).
- Cara memeriksa:
  1. ORCHESTRATOR: jalankan migrasi 0005 via `scripts/run-migrations.mjs` (atau SQL Editor, urut setelah 0004). Jalankan dua kali untuk bukti idempoten — tidak boleh ada error.
  2. Di SQL Editor sebagai authenticated: `select * from public.community_stats;` → semua baris komunitas muncul dengan angka penuh. Bandingkan dengan `select count(*) from community_members where community_id = '<id>';` dan `select count(*) from posts where community_id = '<id>' and not is_deleted and not is_hidden;` (angka harus sama; sebagai user biasa dua query ini terbatas RLS, itu wajar).
  3. Sebagai anon (SQL Editor mode anon / request tanpa login): `select * from public.community_stats;` harus `permission denied`.
  4. RPC user (sudah live dari 0002, tidak diubah 0005): dari akun moderator panggil `select mod_apply_action('suspend','user','<uuid>','alasan',7);` → profil jadi `status='suspended'`, `suspended_until ≈ now()+7 hari`, baris baru di `mod_actions`; `'ban'` → `status='banned'`; `'restore'` → `status='active'`, `suspended_until` null. Non-moderator → exception `FORBIDDEN`; `'hide'`/`'delete'` pada target user → exception `ACTION_INVALID`.
 
# FASE 4 — BACKEND-AGENT (Foto & moderasi)

## [FASE 4] BACKEND-AGENT -> ORCHESTRATOR / MOD-AGENT / MEDIA-AGENT / FRONTEND-AGENT

- Selesai: aksi foto (`getPostImages`), laporan (`report`), seluruh aksi antrean moderasi & dashboard admin (`getReports`, `modApplyAction` via RPC `mod_apply_action`, `modDismissReports` via RPC `mod_dismiss_reports`, `listUsers`, `listInvites`, `createInvite`, `listCommunitiesAdmin`, `createCommunity`, `updateCommunity`, `getModLog`), profil (`updateProfile`), serta PERLUASAN `posts.ts`: `createPost` menerima `images?: string[]` (path hasil upload MEDIA-AGENT) dan `getFeed`/`getPost` menyertakan `images: string[]` (URL publik) di tiap post. Semua aksi "use server", bentuk hasil tetap `ActionResult<T>` (`{ ok:true, data }` / `{ ok:false, code, message }`), klien server dengan sesi pengguna (RLS aktif), env lazy (build tetap jalan tanpa kredensial). Kontrak lama TIDAK berubah bentuk — hanya ditambah field/baru.
- File yang dibuat/diubah:
  - lib/actions/images.ts (baru)
  - lib/actions/reports.ts (baru)
  - lib/actions/admin.ts (baru)
  - lib/actions/profiles.ts (baru)
  - lib/actions/posts.ts (diubah — hanya TAMBAH: field `images` di FeedPost/CreatePostInput + insert post_images; kontrak/jalur lama tidak disentuh)
  - lib/errors.ts (diubah: +9 kode pada union `ErrorCode` + `ERROR_MESSAGES`; helper lama tidak berubah)
  - package.json (diubah: + dependency `browser-image-compression: ^2.0.2` untuk MEDIA-AGENT)
  - docs/handoff/FASE4-BACKEND.md (file ini)
  - TIDAK diubah: lib/actions/{auth,communities,comments,votes,comment-tree,validate,index}.ts, lib/supabase/*, app/**, components/** (termasuk ImagePicker milik MEDIA), lib/image/**, supabase/**, middleware.ts, docs/PROGRESS.md.
- Kontrak yang disediakan (nama item persis snake_case kolom DB):

  ```ts
  // ================= lib/actions/images.ts =================
  getPostImages(postId: string): Promise<ActionResult<{ images: string[] }>>
    // PRD 24 getPostImages. URL publik bucket post-images (getPublicUrl),
    // urut kolom `position` (PRD 24 eksplisit; post_images TIDAK punya
    // created_at — lihat asumsi 1), tiebreak id. Siapa boleh baca dijaga RLS
    // pimg_select: pemilik post/moderator (walau post hidden/deleted);
    // pengguna lain hanya bila post masih ada di posts_feed (via detail/feed).
    // Panggilan ke post tersembunyi oleh orang lain → { images: [] } (bukan error).
    // postId kosong → NOT_FOUND; belum login → LOGIN_REQUIRED.

  // ================= lib/actions/reports.ts =================
  type ReportTargetType = "post" | "comment";
  // Alasan yang sah (CHECK DB, PRD 4.6) — konstanta TIDAK diekspor (file
  // "use server" hanya boleh mengekspor fungsi async); FE menyalin daftar ini.
  // REPORT_REASONS = ["spam", "porn", "violence_sara", "doxxing", "other"]
  interface ReportInput {
    targetType: ReportTargetType;
    targetId: string;   // uuid
    reason: string;     // wajib salah satu REPORT_REASONS (CHECK DB, PRD 4.6)
    note?: string;      // opsional; trim, "" → null, dipangkas 1000 char
  }
  report(input: ReportInput): Promise<ActionResult<null>> // PRD 24 report
    // insert reports (reporter_id, target_type, target_id, reason, note);
    // status dibiarkan default 'open' (grant kolom DB). Duplikasi laporan
    // oleh user sama untuk target sama → REPORT_DUPLICATE (pra-cek + fallback
    // unique violation 23505). Laporan ke-3 dari akun berbeda memicu auto-hide
    // di trigger DB (PRD 16.6) — tidak ada logika tambahan di app.

  // ================= lib/actions/admin.ts =================
  type ModerationTargetType = "post" | "comment" | "user";
  type ModerationAction = "hide" | "delete" | "warn" | "suspend" | "ban" | "restore";
  type ReportStatus = "open" | "resolved" | "dismissed";

  interface ReportPostSnippet {
    kind: "post";
    title: string | null;      // judul utuh (maks 200 sesuai skema)
    body: string | null;       // dipotong 280 code point
    is_hidden: boolean;
    is_deleted: boolean;
    image_urls: string[];      // URL publik foto post, urut position
    author_id: string | null;  // penulis ASLI meski post anonim (PRD 18.6.4)
    author_username: string | null;
  }
  interface ReportCommentSnippet {
    kind: "comment";
    body: string | null;       // dipotong 280 code point
    is_removed: boolean;       // is_hidden || is_deleted (semantik comments_view)
    author_id: string | null;
    author_username: string | null;
  }
  type ReportTargetSnippet = ReportPostSnippet | ReportCommentSnippet;

  interface ReportItem {       // kolom reports (snake_case) + pengayaan
    id: string;
    reporter_id: string;
    reporter_username: string | null;
    target_type: ModerationTargetType;
    target_id: string;
    reason: string;            // spam | porn | violence_sara | doxxing | other
    note: string | null;
    status: ReportStatus;
    created_at: string;
    report_count: number;      // banyaknya laporan target sama dalam antrean
    target_snippet: ReportTargetSnippet | null; // null utk target 'user'/hilang
  }
  getReports(status?: ReportStatus): Promise<ActionResult<{ reports: ReportItem[] }>>
    // maks 500 baris terbaru; urut report_count desc lalu created_at desc
    // (PRD 18.6.4 "paling banyak dilaporkan"). Snippet post HANYA dari tabel
    // posts mentah (RLS posts_select mengizinkan moderator) — view
    // posts_feed justru menyembunyikan post yang perlu ditinjau.

  interface ModApplyActionInput {
    action: ModerationAction;
    targetType: ModerationTargetType;
    targetId: string;          // uuid
    reason: string;            // dicatat di mod_actions; "" → null
    days?: number;             // lama suspend; tidak dikirim → default RPC 3
  }
  modApplyAction(input: ModApplyActionInput): Promise<ActionResult<null>>
    // PRD 24 modAction → rpc('mod_apply_action',
    // { p_action, p_target_type, p_target_id, p_reason, p_days? }) — parameter
    // PERSIS PRD 16.6. Validasi cepat app: kombinasi user+hide/delete dan
    // days 1–365 → ACTION_INVALID; tipe target/id salah → TARGET_INVALID.
    // RPC yang menulis data + mod_actions (security definer).

  interface ModDismissReportsInput { targetType: ModerationTargetType; targetId: string; }
  modDismissReports(input: ModDismissReportsInput): Promise<ActionResult<null>>
    // PRD 24 modDismiss → rpc('mod_dismiss_reports', { p_target_type, p_target_id }):
    // laporan open → dismissed + konten tersembunyi otomatis ditampilkan lagi (PRD 16.6).

  interface AdminUserItem {
    id: string;
    username: string;
    role: "member" | "moderator" | "admin";
    status: "active" | "suspended" | "banned";
    suspended_until: string | null;
    created_at: string;
  }
  listUsers(search?: string): Promise<ActionResult<{ users: AdminUserItem[] }>>
    // ilike username (karakter % _ dibersihkan), urut username asc, LIMIT 50.

  interface InviteItem {
    code: string;
    created_by: string | null;
    created_by_username: string | null;
    max_uses: number;
    used_count: number;
    expires_at: string | null;
    created_at: string;
  }
  listInvites(): Promise<ActionResult<{ invites: InviteItem[] }>>
    // maks 200, terbaru dulu.
  interface CreateInviteInput { maxUses: number; expiresAt?: string; }
  createInvite(input: CreateInviteInput): Promise<ActionResult<{ code: string }>>
    // pre-cek ADMIN; kode 8 karakter A-Z0-9 dibuat server (bukan klien);
    // maxUses wajib integer 1–1000; expiresAt wajib ISO parseable bila ada
    // → INVITE_INPUT_INVALID. used_count tidak pernah dikirim (grant DB).

  interface AdminCommunityItem {
    id: string; slug: string; name: string; description: string | null;
    created_at: string;
    member_count: number | null; // null bila view community_stats belum ada
    post_count: number | null;   // (asumsi kolom view — lihat asumsi 12)
  }
  listCommunitiesAdmin(): Promise<ActionResult<{ communities: AdminCommunityItem[] }>>
  interface CreateCommunityInput { slug: string; name: string; description?: string; }
  createCommunity(input: CreateCommunityInput): Promise<ActionResult<{ id: string; slug: string }>>
    // pre-cek ADMIN; slug wajib ^[a-z0-9-]{2,30}$; nama 1–80 char
    // → COMMUNITY_INVALID; slug duplikat → COMMUNITY_SLUG_TAKEN.
  interface UpdateCommunityInput { id: string; name?: string; description?: string; }
  updateCommunity(input: UpdateCommunityInput): Promise<ActionResult<{ id: string }>>
    // pre-cek ADMIN; patch dibangun dari field yang dikirim; tidak ada field
    // → sukses tanpa tulis; id tak dikenal → NOT_FOUND.

  interface ModActionItem {
    id: string;
    moderator_id: string;
    moderator_username: string | null;
    action: ModerationAction;
    target_type: ModerationTargetType;
    target_id: string;
    reason: string | null;
    created_at: string;
  }
  getModLog(limit = 100): Promise<ActionResult<{ actions: ModActionItem[] }>>
    // dari mod_actions (RLS is_moderator), terbaru dulu, limit di-clamp 1–500.

  // ================= lib/actions/profiles.ts =================
  // BIO_MAX = 200 (tidak diekspor — file "use server")
  interface UpdateProfileInput { bio?: string; avatarUrl?: string; }
  updateProfile(input: UpdateProfileInput): Promise<ActionResult<null>>
    // update profiles milik sendiri (grant kolom DB: avatar_url, bio —
    // username/role/status tidak bisa lewat sini). bio: trim, > 200 code
    // point → BIO_TOO_LONG, "" → null. avatarUrl: URL publik bucket avatars
    // (pathname mengandung /object/public/avatars/) ATAU path storage
    // `{user.id}/{file}` yang dinormalkan ke URL publik; lainnya →
    // AVATAR_INVALID; "" → hapus (null). Tidak ada field → no-op sukses.

  // ================= lib/actions/posts.ts (PERLUASAN — kolom lama tetap) =================
  interface CreatePostInput {
    communityId?: string; communitySlug?: string; title: string;
    body?: string; isAnonymous?: boolean;
    images?: string[];   // BARU: path storage bucket post-images milik sendiri
                         // (`${user.id}/${uuid}.${ext}`), maks 4 (PRD 25)
  }
  interface FeedPost { /* kolom lama persis Fase 3 */ images: string[]; } // BARU
  // getFeed: tiap FeedPost.images = URL publik urut position (1 query
  // post_images per halaman). getPost: data.post.images terisi sama.
  // Gagal memuat foto → images: [] + console.error (feed/detail tetap sukses).
  ```

- Kode error per aksi:
  - Semua aksi: `LOGIN_REQUIRED` (belum login), `NETWORK`/`UNKNOWN`/`RLS_DENIED` dari extractErrorCode.
  - getPostImages: NOT_FOUND (postId kosong).
  - report: REPORT_INVALID (tipe target/id/nilai alasan tidak dikenal), REPORT_DUPLICATE (PRD 18.6.2 "Kamu sudah melaporkan ini"), RLS_DENIED (akun suspended/banned — RLS reports_insert menuntut is_active_user).
  - getReports / listUsers / listInvites / getModLog / modApplyAction / modDismissReports / listCommunitiesAdmin: FORBIDDEN (bukan moderator/admin — pre-cek), plus error dari RPC moderasi: ACTION_INVALID, TARGET_INVALID, NOT_FOUND, FORBIDDEN (moderator menindak admin — PRD 18.6.6).
  - createInvite: FORBIDDEN (bukan admin), INVITE_INPUT_INVALID.
  - createCommunity/updateCommunity: FORBIDDEN (bukan admin), COMMUNITY_INVALID, COMMUNITY_SLUG_TAKEN, NOT_FOUND (id salah).
  - createPost (baru): IMAGE_INVALID (images > 4 atau bukan array); path bukan milik sendiri dibuang + console.warn (bukan error); kegagalan insert satu foto hanya console.error — post tetap sukses.
  - updateProfile: BIO_TOO_LONG, AVATAR_INVALID, NOT_FOUND (profil hilang).
- Yang dibutuhkan dari agent lain:
  - MEDIA-AGENT: (a) jalankan `npm install` — package.json sudah berisi `browser-image-compression@^2.0.2` (owner package.json = BACKEND-AGENT; saya TIDAK menjalankan npm); (b) unggah foto ke bucket `post-images` path `${user.id}/${uuid}.${ext}` dari browser (PRD 25.2–25.3), lalu kirim DAFTAR PATH (BUKAN URL, BUKAN base64) sebagai `images` ke `createPost`; (c) avatar: unggah ke bucket `avatars` lalu kirim path/URL publik ke `updateProfile({ avatarUrl })`.
  - MOD-AGENT: pakai lib/actions/admin.ts (semua bentuk item snake_case persis seperti di atas). Antrean: `getReports("open")`; tombol tindakan → `modApplyAction`; "Tolak laporan" → `modDismissReports`; kombinasi `targetType:"user"` hanya boleh dengan action `warn`/`suspend`/`ban`/`restore` (hide/delete pada user ditolak ACTION_INVALID, sama seperti RPC).
  - FRONTEND-AGENT: `FeedPost` kini punya `images: string[]` (tambahan — kode lama tetap valid); dialog lapor panggil `report()`; halaman pengaturan panggil `updateProfile()`; `SessionProfile.avatarUrl` dari getSessionUser() akan terisi setelah updateProfile sukses (panggil ulang session/refresh).
  - DB-AGENT (Fase 4): view `community_stats` — saya mengasumsikan kolom `community_id, member_count, post_count` (lihat asumsi 12); selama view belum ada, `listCommunitiesAdmin` tetap sukses dengan angka null.
- Asumsi / keputusan:
  1. Urutan foto memakai kolom `position` (PRD 24 eksplisit `.order('position')`), BUKAN `created_at` sesuai instruksi awal: tabel `post_images` (migrasi 0001) tidak punya kolom created_at, jadi urutan waktu tidak tersedia; tiebreak `id` untuk deterministik.
  2. `FeedPost`/`getPost` ditambah field `images: string[]` tanpa mengubah kolom lama; kegagalan baca foto tidak menggagalkan feed/detail (images kosong) — foto bersifat pelengkap.
  3. `createPost.images` menerima PATH storage (bukan URL): MEDIA-AGENT yang mengunggah dari browser. Validasi app: >4 → IMAGE_INVALID (ditolak sebelum post dibuat); path tidak berawalan `${user.id}/` dibuang + console.warn; duplikat path didedup. Insert post_images dilakukan SATU PER SATU setelah post dibuat; gagal satu hanya dicatat (console.error), post tetap tayang — mengikuti instruksi Fase 4, BERBEDA dari PRD 25.4 (yang menghapus post + file) — file yatim tetap dibersihkan job mingguan (PRD 20 kasus tepi 3).
  4. Kontrak images hanya string[] → kolom width/height post_images tersimpan null (MEDIA-AGENT memakainya untuk <img> dari hasil kompres; tidak dikirim ke server).
  5. lib/errors.ts +9 kode pola sama dengan Fase 2/3: REPORT_DUPLICATE, REPORT_INVALID, TARGET_INVALID (dilempar RPC 16.6 untuk tipe target asing), IMAGE_INVALID, BIO_TOO_LONG, AVATAR_INVALID, COMMUNITY_INVALID, COMMUNITY_SLUG_TAKEN, INVITE_INPUT_INVALID.
  6. `report.reason` divalidasi app terhadap CHECK skema (spam/porn/violence_sara/doxxing/other) supaya pesan cepat; `note` trim, kosong → null, dipangkas 1000 karakter (skema tidak membatasi — UI disarankan batasi juga).
  7. Pre-cek role admin.ts: level "moderator" (moderator|admin) untuk getReports, kedua RPC moderasi, listUsers, listInvites, getModLog, listCommunitiesAdmin; level "admin" untuk createInvite, createCommunity, updateCommunity (RLS comm_admin/invite_admin_write hanya admin — pre-cek memberi FORBIDDEN yang jelas alih-alih RLS_DENIED). Pre-cek hanya melihat role: moderator yang di-suspend lolos pre-cek lalu ditolak DB (is_moderator() menuntut status active) → RLS_DENIED/FORBIDDEN dari DB, tidak diduplikasi di app.
  8. getReports: maks 500 baris terbaru (tanpa parameter halaman — kontrak Fase 4 tidak memintanya); `report_count` dihitung dalam jendela antrean yang sama; urutan report_count desc lalu created_at desc (PRD 18.6.4). Snippet dibaca dari TABEL MENTAH posts/comments (moderator lolos RLS posts_select/comments_select) karena view justru menyembunyikan konten yang perlu ditinjau — sesuai instruksi. Bacaan sekunder (posts, comments, profiles, post_images) dibaca per batch 100 id dan soft-fail (array kosong + console.error) agar dashboard tidak mati total; hanya query `reports` yang hard-fail.
  9. Snippet: body dipotong 280 code point (mendekati char_length, aman emoji) tanpa sufiks; judul utuh (maks 200 skema); penulis asli disertakan meski post anonim (PRD 18.6.4 dan PRD 20 kasus tepi 9) — moderator yang membaca, bukan publik.
  10. modApplyAction memakai parameter RPC persis PRD 16.6; `p_days` dihapus dari payload bila tidak dikirim sehingga default RPC 3 berlaku; `p_reason` "" → null. Validasi kombinasi `user`+`hide/delete` diduplikasi di app agar pesan cepat (RPC juga menolak).
  11. createInvite: kode dibuat SERVER (8 char A-Z0-9, crypto.getRandomValues); tabrakan unique (23505) dicoba ulang maks 5 kali lalu UNKNOWN; `used_count` tidak pernah dikirim (grant kolom DB migrasi 0003).
  12. `listCommunitiesAdmin` membaca view `community_stats` dengan kolom yang DIASUMSIKAN `(community_id, member_count, post_count)`; view belum ada / kolom beda → angka null + console.warn (bukan error). PERLU konfirmasi DB-AGENT bila bentuk view berbeda.
  13. updateProfile menerima avatar sebagai URL publik bucket avatars ATAU path `{user.id}/...` (dinormalkan ke URL publik via getPublicUrl sebelum disimpan) — keduanya berasal dari upload MEDIA-AGENT; URL eksternal/ bucket lain ditolak AVATAR_INVALID.
  14. lib/actions/index.ts TIDAK disentuh (di luar daftar file milik Fase 4); komentar daftar modulnya sudah menyebut reports/admin/media.
- Cara memeriksa:
  1. `npm install` (menarik browser-image-compression) lalu `npm run build` harus lulus tanpa env asli (env lazy; tidak ada akses DB saat build).
  2. Login, buat post dengan foto: unggah 2 file via MEDIA (path `.../{user.id}/a.webp`, `.../{user.id}/b.webp`) → `createPost({ communitySlug: "umum", title: "Foto", images: [path1, path2] })` → sukses; `getPost(id)` → `post.images` berisi 2 URL publik urut kirim; `getFeed()` → post sama punya images sama; `getPostImages(id)` → array sama.
  3. `createPost({ ..., images: [path1, path2, path3, path4, path5] })` → IMAGE_INVALID; path `"/tmp/x.webp"` dibuang otomatis (console.warn) dan post tetap sukses tanpa foto itu; tanpa sesi → LOGIN_REQUIRED.
  4. `report({ targetType: "post", targetId, reason: "spam" })` → ok; ulang alasan apa pun untuk target sama oleh user sama → REPORT_DUPLICATE; reason "cabul" → REPORT_INVALID. Laporan ke-3 dari 3 akun berbeda → post hilang dari getFeed/getPost pengguna lain (trigger DB), pemilik tetap melihat + punya images.
  5. Dengan akun moderator: `getReports("open")` → laporan terurut paling banyak dilaporkan, snippet berisi title/body(is_hidden/is_deleted/image_urls) atau komentar(is_removed), reporter_username dan penulis asli terisi meski post anonim; akun member → FORBIDDEN.
  6. `modApplyAction({ action: "hide", targetType: "post", targetId, reason: "SARA" })` → ok; post menghilang dari view; reports open target itu → resolved; `getModLog()` memuat baris aksi; `modApplyAction({ action: "hide", targetType: "user", ... })` → ACTION_INVALID; `modApplyAction({ action: "suspend", targetType: "user", targetId, reason, days: 7 })` → profil jadi suspended 7 hari (suspend 1/3/7/30 per PRD 18.6.5); `modDismissReports({ targetType: "post", targetId })` → laporan dismissed + post tampil lagi.
  7. Admin: `createInvite({ maxUses: 5 })` → kode 8 karakter; kode dipakai daftar → used_count naik (trigger); `createInvite({ maxUses: 0 })` → INVITE_INPUT_INVALID; moderator → FORBIDDEN. `createCommunity({ slug: "Umum!", name: "X" })` → COMMUNITY_INVALID; slug duplikat → COMMUNITY_SLUG_TAKEN; `listCommunitiesAdmin()` → counts null sampai view community_stats dibuat DB-AGENT.
  8. `updateProfile({ bio: "  halo  " })` → bio "halo"; bio 201 char → BIO_TOO_LONG; `updateProfile({ avatarUrl: "https://contoh.com/x.png" })` → AVATAR_INVALID; path `{user.id}/a.webp` → tersimpan sebagai URL publik bucket avatars; `updateProfile({})` → sukses tanpa tulis.
  9. Akun suspended mencoba report/createPost(images) → RLS_DENIED (RLS/trigger), bukan error app.
 
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
 
# FASE 4 — MOD-AGENT (Moderasi & admin)

## [FASE 4] MOD-AGENT -> ORCHESTRATOR / FRONTEND-AGENT

- Selesai: seluruh Fase 4 (Moderasi dan admin) — dashboard admin `/admin` dengan guard role, antrean laporan (grouping per target, thumbnail DIBURAMKAN, aksi konten + tolak laporan + aksi penulis), halaman pengguna (pencarian + suspend/blokir/reaktivasi dengan dialog konfirmasi), kode undangan (daftar + buat + salin), komunitas (daftar + buat + edit deskripsi), log moderasi, serta `components/ReportDialog.tsx` untuk FRONTEND-AGENT. Semua UI bahasa Indonesia, mobile-first, hanya memakai kit `components/ui/*` (Button/Card/Badge/Input/Textarea/Avatar/EmptyState/ErrorState/Spinner), tanpa dependensi baru, semua aksi data lewat kontrak `@/lib/actions/reports` + `@/lib/actions/admin` (tidak ada akses Supabase langsung dari UI).
- File yang dibuat (milik MOD-AGENT — tidak ada file milik agent lain yang disentuh):
  - app/admin/layout.tsx — guard server `getSessionUser()`: tamu/member → `redirect("/")`; header "Dashboard Admin" + link "← Forum" + nav tab
  - app/admin/page.tsx — antrean laporan (default), filter status via query param `?status=open|resolved|dismissed`
  - app/admin/users/page.tsx — pencarian GET `?q=` + daftar pengguna + aksi akun
  - app/admin/invites/page.tsx — daftar + form buat kode undangan
  - app/admin/communities/page.tsx — daftar + form buat + edit deskripsi
  - app/admin/log/page.tsx — 100 tindakan mod_actions terbaru (read-only)
  - components/ReportDialog.tsx — dialog "Laporkan" (dipakai FRONTEND-AGENT)
  - components/admin/AdminTabs.tsx — tab aktif via usePathname (wireframe PRD 22.4)
  - components/admin/ReportsQueue.tsx — client component antrean (aksi + blur thumbnail)
  - components/admin/UsersPanel.tsx — aksi akun + ConfirmDialog
  - components/admin/InvitesPanel.tsx — buat kode + tombol salin (clipboard + fallback)
  - components/admin/CommunitiesPanel.tsx — buat komunitas + edit deskripsi inline
  - components/admin/ConfirmDialog.tsx — modal konfirmasi ringan (Escape/backdrop/Batal)
  - components/admin/StatusBadge.tsx — badge status laporan/akun/role/aksi/target (fungsi murni)
  - components/admin/format.ts — labelAlasan/REASON_LABELS, formatTanggal, idPendek
  - components/admin/server-data.ts — pembungkus `aman()` try/catch untuk Server Component (pola sama dengan components/feed/server-data.ts milik FRONTEND-AGENT — tidak diubah, dibuat salinan agar tidak saling sentuh)
  - docs/handoff/FASE4-MOD.md (file ini)
  - TIDAK diubah: lib/**, app/(main)/**, app/(auth)/**, components/ui/**, components/feed/**, components/*.tsx milik agent lain, supabase/**, middleware.ts, docs/PROGRESS.md, package.json.
- KONTRAK ReportDialog (PENTING untuk FRONTEND-AGENT — nama prop PERSIS, jangan diubah):
  ```tsx
  import ReportDialog from "@/components/ReportDialog";
  // state di pemilik menu titik-titik:
  const [lapor, setLapor] = useState<{ type: "post" | "comment"; id: string } | null>(null);
  <ReportDialog
    targetType={lapor.type}        // "post" | "comment"
    targetId={lapor.id}            // uuid target
    open={lapor !== null}          // boolean
    onClose={() => setLapor(null)} // () => void
    onReported={() => { /* opsional: refresh/marked */ }}
  />
  ```
  - Perilaku: kirim via `report({ targetType, targetId, reason, note? })` dari `@/lib/actions/reports`; alasan sesuai nilai CHECK DB (PRD 4.6) — `spam` "Spam", `porn` "Porno / konten dewasa", `violence_sara` "SARA / kekerasan", `doxxing` "Doxxing (membocorkan data pribadi)", `other` "Lainnya" — catatan opsional maks 1000 char; sukses → tampil "Laporan terkirim. Terima kasih." lalu menutup sendiri (±1,6 dtk) dan memanggil `onReported?.()`; error inline (termasuk REPORT_DUPLICATE "Kamu sudah melaporkan ini" dari backend, PRD 18.6.2); tutup via tombol ×, Batal, Escape, klik latar (nonaktif saat mengirim); `open=false` → render null. Mobile-first (bottom-sheet di layar kecil, modal tengah di ≥sm).
- Struktur dashboard `/admin` (PRD 22.4, 18.6):
  - Guard: layout `app/admin/layout.tsx` menolak tamu/member (redirect "/"); setiap aksi dijaga ulang dua lapis oleh backend (pre-cek role + RLS/RPC) — layout hanya UX.
  - Tab: Laporan (`/admin`), Pengguna, Kode Undangan, Komunitas, Log — tab aktif via `usePathname`.
  - Antrean laporan: default `?status=open`; data `getReports(status)`; laporan target sama dikelompokkan satu kartu — badge "dilaporkan Nx", gabungan alasan, pelapor (maks 2 + "+N lain"), catatan kutip, cuplikan konten + "Penulis asli: @username" (PRD 18.6.4 / 20 kasus tepi 9), badge Tersembunyi/Terhapus.
  - Thumbnail foto post DIBURAMKAN (CSS `blur-lg` + overlay "Klik untuk lihat", aria-pressed; klik untuk membuka, klik lagi memburamkan) — PRD 22.4.
  - Tombol per kartu: Sembunyikan (hide), Hapus (delete — post saja, via ConfirmDialog), Pulihkan (restore bila hidden/deleted), Tolak laporan (modDismissReports — hanya saat filter open), plus baris "Tindakan penulis": pilih lama suspend 1/3/7/30 hari (PRD 18.6.5) → Suspend penulis, Blokir penulis (ban, via ConfirmDialog). Target tak lagi ada → hanya info + Tolak laporan (hide/delete pasti NOT_FOUND).
  - Setiap aksi sukses → `router.refresh()`; pesan sukses/error inline (success status / alert). RPC menutup laporan open otomatis → baris hilang dari filter open setelah refresh.
  - Pengguna: cari via form GET `?q=` (tanpa JS); per kartu: Avatar, RoleBadge, UserStatusBadge, "Bergabung…", "Suspend sampai…"; aksi Suspend (pilih 1/3/7/30 hari), Blokir, Reaktivasi — SEMUA melewati ConfirmDialog, via `modApplyAction({ targetType: "user" })`. Tombol disembunyikan untuk target admin bila penonton moderator (PRD 18.6.6, server tetap menolak FORBIDDEN) dan untuk akun sendiri.
  - Kode undangan: daftar (kode mono + Salin, dipakai x/max, kedaluwarsa/tanpa kedaluwarsa, dibuat oleh, badge Aktif/Habis/Kedaluwarsa) + form buat (jumlah pakai maks 1–1000, tanggal kedaluwarsa opsional → ISO 23:59 tanggal itu). Form hanya untuk admin (moderator melihat catatan; FORBIDDEN tetap ditangani inline). Salin: navigator.clipboard + fallback execCommand.
  - Komunitas: daftar (nama, c/slug, anggota/post dari view community_stats — "—" bila null) + form buat (slug `^[a-z0-9-]{2,30}$`, nama 1–80, deskripsi) + "Edit deskripsi" inline (updateCommunity; kosong → hapus deskripsi). Form/edit hanya admin.
  - Log: kartu per aksi — ModActionBadge, TargetTypeBadge, uuid dipendekkan (title uuid penuh), "Oleh @moderator", alasan, waktu relatif. Read-only.
- Kebutuhan dari agent lain:
  - FRONTEND-AGENT: pasang `ReportDialog` pada menu titik tiga post (PostCard) dan komentar (CommentTree) dengan prop persis seperti di atas — TIDAK perlu mengubah apa pun di components/ReportDialog.tsx. Jangan buat dialog lapor sendiri.
  - BACKEND-AGENT: kontrak `getReports/modApplyAction/modDismissReports/listUsers/listInvites/createInvite/listCommunitiesAdmin/createCommunity/updateCommunity/getModLog/report` dipakai apa adanya (sudah sesuai handoff FASE4-BACKEND). Tidak ada perubahan kontrak yang diminta.
  - DB-AGENT: view `community_stats` opsional — angka tampil "—" bila belum ada.
- Asumsi / keputusan:
  1. Filter antrean lewat query param server (`?status=`) bukan state client — tetap Server Component, bisa di-bookmark, dan `router.refresh()` setelah aksi otomatis memuat ulang data dengan filter yang sama.
  2. Laporan digroup per (target_type, target_id) di ReportsQueue (useMemo) agar satu konten = satu kartu aksi (PRD 22.4 "dilaporkan 4x — alasan: porn, spam"); data mentah per-laporan tetap dari `getReports`.
  3. Alasan dialog lapor memakai nilai DB `spam|porn|violence_sara|doxxing|other` (PRD 4.6) dengan label Indonesia — bukan frasa bebas, karena `report()` menolak nilai di luar CHECK (REPORT_INVALID).
  4. Aksi penulis (suspend/ban) ikut ditampilkan di antrean (wireframe 22.4 menampilkannya); UI tidak menebak role penulis — moderator yang menindak admin akan menerima FORBIDDEN dari RPC dan pesan error tampil inline (PRD 18.6.6).
  5. ConfirmDialog dipakai untuk aksi destruktif/permanen: Hapus post, Blokir penulis (antrean) dan SEMUA aksi akun di halaman Pengguna (suspend/blokir/reaktivasi — sesuai instruksi). Hide/restore/dismiss cukup satu klik karena reversibel.
  6. Opsi suspend 1/3/7/30 hari mengikuti PRD 18.6.5 (instruksi menyebut 1/3/7 — diambil superset agar sesuai PRD; 1/3/7 tetap tersedia).
  7. `kini` (Date.now() server) dikirim sebagai prop ke InvitesPanel agar hitungan badge kedaluwarsa deterministik saat hidrasi; waktu relatif lain mengikuti pola feed yang sudah ada.
  8. Halaman admin TIDAK di dalam route group (main) — konsol terpisah dengan header sendiri; middleware sengaja tidak menyentuh /admin (komentar middleware menyebut redirect route protection menyusul — guard layout sudah menutup kebutuhan ini).
  9. Semua error memakai pesan ramah dari backend (`{ ok:false, message }`) — PRD 20; pemanggilan data server dibungkus `aman()` agar env belum terisi tidak membuat build/halaman mati.
- Cara memeriksa:
  1. `npm run build` harus lulus (tidak dijalankan oleh MOD-AGENT sesi ini — batasan hanya Read/Write/Edit; semua file mengikuti pola Fase 1–3 yang sudah build).
  2. Buka `/admin` sebagai tamu/member → diarahkan ke "/"; sebagai moderator/admin → tab tampil, tab Laporan aktif.
  3. Buat 3 akun melaporkan post yang sama → antrean memperlihatkan "dilaporkan 3x", gabungan alasan, thumbnail blur (klik untuk melihat), penulis asli tampil meski post anonim.
  4. Sembunyikan → badge Tersembunyi + tombol berubah Pulihkan; Pulihkan → normal; Hapus (post, dengan konfirmasi) → laporan open jadi Selesai; Tolak laporan → pindah filter Ditolak + konten tampil lagi; semua tercatat di tab Log.
  5. Tindakan penulis: Suspend 3 hari → halaman Pengguna menampilkan status Suspend + "Suspend sampai …"; Blokir → status Diblokir; Reaktivasi → Aktif. Baris admin tidak punya tombol untuk moderator.
  6. Tab Kode Undangan (admin): buat kode (mis. 5 pakai) → banner kode baru + Salin; daftar memperlihatkan dipakai/kedaluwarsa; moderator hanya lihat + salin. Tab Komunitas (admin): buat `c/teh-dan-kopi`, edit deskripsi; slug salah/duplikat → pesan COMMUNITY_INVALID/COMMUNITY_SLUG_TAKEN inline.
  7. Dialog lapor (via FRONTEND-AGENT): pilih alasan wajib, catatan opsional, sukses "Laporan terkirim. Terima kasih." lalu menutup; lapor dua kali target sama → "Kamu sudah melaporkan ini" (REPORT_DUPLICATE).
 
# FASE 4 — FRONTEND-AGENT (Integrasi Fitur di Sisi Pengguna)

## [FASE 4] FRONTEND-AGENT -> ORCHESTRATOR

- **Selesai**: seluruh integrasi fitur Fase 4 di sisi pengguna sesuai PRD (bagian 4.5–4.7, 6, 18.3, 18.4, 18.5, 18.7, 20, 25, 28.1): (1) foto di /submit — ImagePicker (maks 4) + kompres & upload per foto saat Kirim dengan progres "Mengunggah foto 2/4..." → "Menyimpan post...", retry hanya foto yang gagal (PRD 18.3.4), rollback `deletePostImage` bila simpan post gagal (PRD 20.3/25.4), pesan jelas untuk akun < 24 jam (PRD 18.3.10); (2) foto di feed & detail — normalizer membaca `images`, thumbnail foto pertama di PostCard, galeri maks 4 foto di /p/[id] dengan dialog perbesar ringan tanpa dependensi; (3) menu titik tiga (components/PostMenu.tsx) — "Lapor" untuk semua (ReportDialog) + "Hapus" dengan confirm ringan dua langkah bila milik sendiri → deletePost/deleteComment → router.refresh(); terpasang di PostCard, header detail, dan tiap komentar; (4) vote komentar (components/CommentVoteButtons.tsx) — optimistic + pulih saat gagal, setVoteComment, tamu → /login, nonaktif untuk akun disuspend; (5) halaman profil /u/[username] — header (Avatar lg, username, bio bila tersedia) + FeedList mode username dengan state kosong "Belum ada postingan"; (6) halaman /settings + components/SettingsForm.tsx — bio (maks 200 + counter) + avatar (ImagePicker single, uploadAvatar seketika saat pilih dengan pratinjau, bisa dihapus) + Simpan → updateProfile → "Tersimpan" + router.refresh(); (7) halaman /rules (app/legal/rules/page.tsx) — teks aturan PRD 28.1 utuh, tujuan tautan "Baca aturan" banner; (8) normalizer/types diperbarui: `images` (fallback []), `authorAvatar`, komentar `isMine` + `myVote`, dan daftar datar comments_view (parent_id) kini DISUSUN JADI POHON di klien (memperbaiki gap Fase 3: getPost mengembalikan komentar flat, normalizer lama hanya membaca `children`). Semua akses data tetap HANYA lewat lib/actions & lib/image; semua teks user tetap teks biasa (tanpa dangerouslySetInnerHTML); bahasa Indonesia; mobile-first; memakai kit components/ui.

- **File yang dibuat/diubah**:
  - components/PostMenu.tsx — BARU (client): tombol titik tiga + menu (Lapor / Hapus), tutup saat klik luar/Escape, error inline, feedback "Laporan terkirim." setelah onReported; wrapper memanggil preventDefault+stopPropagation agar aman dipasang di dalam Link PostCard; props `{ targetType: "post"|"comment", targetId, isMine? }`.
  - components/CommentVoteButtons.tsx — BARU (client): panah naik/turun ringkas per komentar (pola VoteButtons: optimistic, klik ulang = batal, pulih saat gagal, skor terbaru dari hasil server), panggil setVoteComment; props `{ commentId, initialScore?, initialMyVote?, isLoggedIn?, disabled? }`.
  - components/SettingsForm.tsx — BARU (client): bio n/200, ImagePicker `single` + uploadAvatar saat pilih (pratinjau seketika dari object URL ImagePicker), hapus avatar → kirim avatarUrl "" ; Simpan → updateProfile({ bio, avatarUrl? }) → "Tersimpan" + router.refresh().
  - components/PostGallery.tsx — BARU (client): kisi foto detail (1 foto = aspect 16/9, 2–4 = grid), klik → overlay fixed (Escape/klik latar/tombol × menutup, scroll latar dikunci), TANPA dependensi. (File tambahan di luar daftar milik awal — dibutuhkan tugas 2 karena halaman /p/[id] adalah Server Component; lihat catatan di bawah.)
  - components/PostCard.tsx — DIUBAH: thumbnail foto pertama (aspect-[16/9], object-cover, lazy) bila post.images ada; PostMenu absolut di pojok kanan atas; kartu kini wrapper div + Link konten (menu tidak lagi di dalam anchor — lebih bersih daripada trik stopPropagation saja); fokus papan tuts memakai focus-within di wrapper.
  - components/CommentTree.tsx — DIUBAH: tiap komentar non-terhapus mendapat CommentVoteButtons (kiri) + PostMenu targetType "comment" (kanan); prop baru `dinonaktifkan?: boolean` (vote & Balas nonaktif untuk akun disuspend — sebelumnya isLoggedIn mencampur dua hal).
  - components/SubmitPostForm.tsx — DIUBAH: seksi foto ImagePicker (max 4, disabled saat submit/nonaktif), state files + paths paralel per posisi, alur Kirim = unggah yang belum punya path (progres "Mengunggah foto i/n...") → createPost({ ..., images: paths }) ("Menyimpan post..."); error foto inline (isFotoError → e.message, selain itu extractErrorCode; kode FORBIDDEN/RLS_DENIED saat upload → PESAN_AKUN_BARU_24JAM sesuai PRD 18.3.10); rollback deletePostImage (allSettled) saat createPost gagal (mengembalikan {ok:false} maupun melempar) dan path di-reset agar retry mengunggah ulang; prop baru `alasanFotoNonaktif?: string | null` (menonaktifkan picker + pesan, PRD 18.3.10).
  - components/feed/types.ts — DIUBAH: helper bacaDaftarTeks; FeedPostView + PostDetailView dapat `images: string[]` (fallback [], kandidat images/foto/postImages/post_images); FeedPostView dapat `authorAvatar`; CommentView dapat `isMine` + `myVote`; toCommentList kini menerima bentuk DATAR comments_view (parent_id) dan menyusun pohon (urutan server dipertahankan; balasan tanpa induk naik ke akar) — bentuk bersarang (children/replies) tetap didukung, komponen lama tidak berubah perilaku kontrak.
  - app/(main)/p/[id]/page.tsx — DIUBAH (di luar daftar milik awal, tapi diminta eksplisit oleh tugas 2 & 3): PostMenu di header (isMine), PostGallery di bawah isi, CommentTree kini menerima isLoggedIn={sudahMasuk} + dinonaktifkan terpisah.
  - app/(main)/u/[username]/page.tsx — BARU: header profil (Avatar lg + username + bio milik sendiri dari sesi + "Aktivitas terakhir" dari post pertama + tombol "Ubah profil" bila profil sendiri) + FeedList mode username (empty state "Belum ada postingan"); generateMetadata `Profil @username`; dynamic = "force-dynamic".
  - app/(main)/settings/page.tsx — BARU: redirect /login bila tamu (pola ambilSesi), render SettingsForm (username/bio/avatar dari sesi) + kartu arahan ganti password ke /reset.
  - app/legal/rules/page.tsx — BARU: halaman statis aturan komunitas, teks 8 butir PRD 28.1 disalin utuh dalam Card + catatan cara melapor; tautan "← Kembali" ke "/". PENTING: app/legal dijadwalkan milik DEVOPS untuk terms/privacy — rules ini dibuat duluan karena dibutuhkan banner (rulesHref default "/rules" di AccountStatusBanner); JANGAN dipindah/dihapus tanpa koordinasi.
  - docs/handoff/FASE4-FRONTEND.md (file ini). TIDAK disentuh: lib/**, app/admin/**, components/ReportDialog.tsx, components/ImagePicker.tsx, lib/image/**, components/ui/**, supabase/**, docs/PROGRESS.md, app/(main)/submit/page.tsx, app/(main)/layout.tsx.

- **Kontrak yang disediakan** (dipakai fase berikutnya / agent lain):
  - components/PostMenu.tsx: `<PostMenu targetType={"post"|"comment"} targetId isMine? />` — client; aman di dalam maupun di luar Link.
  - components/CommentVoteButtons.tsx: `<CommentVoteButtons commentId initialScore? initialMyVote? isLoggedIn? disabled? />`.
  - components/PostGallery.tsx: `<PostGallery images={string[]} title? />` — kosong → render null.
  - components/SettingsForm.tsx: `<SettingsForm username initialBio initialAvatarUrl />`.
  - types.ts: `FeedPostView.images: string[]`, `FeedPostView.authorAvatar: string | null`, `CommentView.isMine: boolean`, `CommentView.myVote: number` (toCommentList menerima flat ATAU bersarang).
  - Halaman aktif: /u/[username], /settings, /rules (+ fitur lapor/hapus/foto/vote komentar di /, /c/[slug], /p/[id], /submit).

- **Yang dibutuhkan dari agent lain**:
  - MOD-AGENT/paralel: `@/components/ReportDialog` (kontrak `<ReportDialog targetType targetId open onClose onReported? />`) — selama file itu belum ada, `next build` error "Cannot find module '@/components/ReportDialog'"; itu diharapkan (pola paralel Fase 3–4), bukan bug. File saya tidak menyentuh ReportDialog.tsx miliknya.
  - BACKEND-AGENT: SessionProfile (getSessionUser) belum menyertakan `createdAt` dan belum ada aksi baca profil ORANG LAIN (getProfileByUsername) — karena itu /u/[username] hanya bisa menampilkan bio/avatar milik sendiri, avatar pengguna lain diambil dari post pertamanya di feed, dan "tanggal gabung" BELUM tampil (slot UI siap). Mohon tambahkan minimal `createdAt` di SessionProfile (dan idealnya getProfileByUsername → { username, bio, avatarUrl, createdAt }) agar header profil lengkap; /settings juga akan otomatis menampilkan avatar terbaru setelah refresh sesi.
  - BACKEND-AGENT: kode IMAGE_LIMIT belum ada di lib/errors.ts (MEDIA menyiapkan FOTO_LIMIT untuk UI) — batas 4 foto saya jaga di UI (ImagePicker max=4) dan backend tetap menolak IMAGE_INVALID; aman.
  - /submit page (app/(main)/submit/page.tsx, milik umum/orchestrator): bila nanti SessionProfile menyertakan createdAt, tolong kirim `alasanFotoNonaktif` ke SubmitPostForm untuk akun < 24 jam (PRD 18.3.10) — prop sudah tersedia; tanpa itu, penolakan storage tetap menampilkan pesan 24 jam yang jelas saat Kirim.
  - ORCHESTRATOR: `npm install` (browser-image-compression milik BACKEND) lalu `npm run build` setelah semua file paralel (khususnya ReportDialog) terkumpul.

- **Asumsi / keputusan**:
  1. Kompres foto TIDAK dipanggil terpisah dari /submit: `uploadPostImage(file)` sudah memanggil `compressImage` di dalamnya (kontrak & contoh integrasi resmi MEDIA-AGENT); memanggil compressImage dulu baru upload berarti kompres ganda (kualitas & waktu terbuang). Progres per foto tetap tampil sesuai permintaan.
  2. Retry foto per posisi: `paths: (string|null)[]` paralel dengan `files`; ganti daftar foto di picker memetakan ulang path berdasar identitas objek File, jadi foto yang sudah sukses tidak diunggah ulang (PRD 18.3.4). Bila createPost gagal, semua file hasil upload di-rollback (deletePostImage, allSettled — error hapus tidak menutup error asli) dan path di-reset; file yatim yang luput dibersihkan job mingguan (PRD 20.3).
  3. Akun < 24 jam (PRD 18.3.10): sesi tidak membawa createdAt sehingga tombol foto TIDAK bisa dinonaktifkan preventif dari UI saat ini. Penanganan: error upload dengan kode FORBIDDEN/RLS_DENIED (storage menolak lewat policy 24 jam) menampilkan pesan khusus yang jelas, dan prop `alasanFotoNonaktif` disiapkan untuk halaman /submit begitu datanya ada. Pemetaan RLS_DENIED→pesan 24 jam aman karena akun disuspend sudah diblokir di level form (alasanNonaktif, Kirim nonaktif).
  4. PostCard direstrukturisasi dari "satu Link penuh" menjadi wrapper div + Link konten + menu absolut: button di dalam anchor itu HTML tidak valid dan rawan navigasi tak terduga; kini hanya area konten yang menavigasi, klik menu tidak pernah membuka post. Perilaku visual (hover, fokus) dipertahankan.
  5. "Hapus" memakai confirm ringan dua langkah DI DALAM menu (klik Hapus → "Hapus post/komentar ini?" → "Ya, hapus"/Batal) alih-alih window.confirm — konsisten gaya UI tanpa dependensi, tetap satu ketukan ekstra sesuai makna "confirm ringan". Setelah sukses: router.refresh() (post hilang dari feed/detail; komentar menjadi "[komentar dihapus]" — soft delete).
  6. Vote komentar ditulis sebagai komponen baru (CommentVoteButtons) agar VoteButtons (post) tidak berubah perilaku — duplikasi kecil disengaja, pola optimistic identik (simpan nilai lama → pulihkan saat gagal, PRD 18.5.2); skor null dari server diabaikan (kembali ke nilai optimistic, sesuai komentar kontrak VoteState).
  7. Komentar datar disusun pohon di normalizer (bukan di CommentTree) agar komponen lama dan pemanggil lain tetap menerima `children`; urutan server (skor desc, waktu asc) dipertahankan apa adanya — tidak diurut ulang di klien.
  8. Profil: tanggal gabung diganti "Aktivitas terakhir <waktu post pertama>" sementara data profil lain belum tersedia (lihat kebutuhan BACKEND di atas); bio hanya untuk profil sendiri; avatar pengguna lain diambil dari post pertama non-anonimnya (heuristik, dipindah ke getProfileByUsername begitu ada). Post anonim otomatis tidak muncul di feed username (penyaringan server, PRD 4.3).
  9. /settings: avatar diunggah SEKETIKA saat dipilih (pratinjau tetap instan dari object URL ImagePicker); bila upload gagal, file tetap terpilih dan Simpan mencoba upload sekali lagi sebelum updateProfile; menghapus avatar lalu Simpan mengirim `avatarUrl: ""` (kontrak updateProfile: string kosong = hapus). Ganti password diarahkan ke alur /reset yang sudah ada (tidak ada kontrak update password langsung dari sesi di fase ini).
  10. /rules berada di luar route group (main) sehingga tanpa header/bottom nav — disengaja (halaman legal statis ala terms/privacy yang akan ditempatkan DEVOPS di folder yang sama); punya tautan "← Kembali" sendiri.
  11. File yang saya buat di luar daftar "BATASAN" milik awal (diperlukan tugas, dicatat agar tidak dianggap pelanggaran): app/(main)/p/[id]/page.tsx (diubah — diminta eksplisit tugas 2 & 3) dan components/PostGallery.tsx (baru — halaman detail adalah Server Component sehingga lightbox wajib client component terpisah). Tidak ada file lain di luar daftar yang disentuh.

- **Cara memeriksa**:
  1. Pastikan components/ReportDialog.tsx (MOD-AGENT) sudah ada, jalankan `npm install` lalu `npm run build` — harus lulus tanpa env asli (env lazy; semua pemanggilan data dibungkus aman).
  2. /submit — pilih 5 foto → pesan "Maksimal 4 foto."; pratinjau & hapus per foto berfungsi; Kirim → "Mengunggah foto 1/2..." berubah "2/2..." lalu "Menyimpan post..." → diarahkan ke detail; matikan jaringan di tengah upload → pesan foto inline, kirim lagi → hanya foto gagal yang diunggah ulang; akun baru (<24 jam) → pesan 24 jam tampil jelas.
  3. Feed — post berfoto menampilkan thumbnail 16:9; menu titik tiga: "Lapor" membuka dialog lapor (sukses → "Laporan terkirim."), post milik sendiri punya "Hapus" → confirm → kartu hilang setelah refresh; klik menu TIDAK membuka detail post.
  4. /p/[id] — semua foto (maks 4) tampil di bawah isi, klik → perbesar (Escape/×/klik latar menutup); menu di header; tiap komentar punya panah vote (optimistic +1/−1, klik ulang batal, tamu → /login) dan menu (Lapor; Hapus bila milik sendiri); balasan tetap bersarang (kini benar dari data datar comments_view).
  5. /u/[username] — header avatar+username (+bio di profil sendiri, tombol "Ubah profil"), feed milik pengguna, kosong → "Belum ada postingan"; BottomNav "Profil" mendarat di sini.
  6. /settings — tamu dialihkan /login; pilih avatar → pratinjau seketika + "Mengunggah avatar..."; bio 201 karakter dicegah (counter n/200); Simpan → "Tersimpan" dan avatar di header ikut berganti (router.refresh); hapus avatar → Simpan → header kembali ke inisial.
  7. Banner suspend (akun disuspend) → tautan "Baca aturan" mendarat di /rules berisi 8 butir aturan PRD 28.1.
  
## [HOTFIX 2026-11-02] ORCHESTRATOR - 
- Bug dari uji manual user: dropdown komunitas kosong di /submit dan feed beranda selalu kosong walau ada post.  
- Akar: aman di components/feed/server-data.ts tidak membuka amplop ActionResult sehingga normalizer salah baca bentuk; toFeedPosts/toCommunityViews tidak mengenali kunci posts/communities dari kontrak BACKEND. Ada sejak Fase 3, tampak setelah database live. Perbaikan serupa sudah diterapkan lebih dulu di components/admin/server-data.ts.  
- Fix: unwrap cerdas di aman + normalizer mengenali kunci posts/communities; build lulus; user perlu menguji ulang alur posting.  
