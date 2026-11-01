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
