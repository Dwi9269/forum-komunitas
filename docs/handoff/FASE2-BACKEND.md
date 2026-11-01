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
