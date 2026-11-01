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
