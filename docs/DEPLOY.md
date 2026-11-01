# Panduan Deploy (Fase 6) — Vercel + Domain chatasiquqe

Target: forum online di **chatasiquqe.my.id** (cadangan: web.id / biz.id) dengan hosting Vercel + database Supabase yang sudah live.

## Ringkasan urutan

1. GitHub (akun + repo + token) → 2. Push kode (orchestrator) → 3. Vercel (import + env) → 4. Uji `*.vercel.app` → 5. DNS domain → 6. Konfigurasi Supabase & `NEXT_PUBLIC_SITE_URL` → 7. SMTP sebelum undang pengguna.

---

## A. GitHub (dikerjakan user)

1. Buat/login akun di <https://github.com>.
2. Klik **+** (kanan atas) → **New repository** → nama: `forum-komunitas` → **Public** → **Jangan** centang README/.gitignore/license (repo harus kosong) → **Create repository**.
3. Buat token untuk push: pojok kanan atas (foto) → **Settings** → **Developer settings** (paling bawah) → **Personal access tokens → Tokens (classic)** → **Generate new token (classic)** → Note: `deploy-forum` → Expiration: 30 hari → centang **repo** → **Generate token** → **salin token** (`ghp_...`).
4. Kirim ke orchestrator: username GitHub + nama repo + token. (Token bisa dicabut setelah push selesai.)

## B. Push kode (dikerjakan orchestrator)

```
git remote add origin https://<TOKEN>@github.com/<USERNAME>/forum-komunitas.git
git push -u origin main
```

## C. Vercel (dikerjakan user, dipandu orchestrator)

1. <https://vercel.com> → **Sign Up** → **Continue with GitHub**.
2. Dashboard → **Add New… → Project** → **Import** repo `forum-komunitas`.
3. Framework: terdeteksi **Next.js** (biarkan). Build/Install: default.
4. **Environment Variables** — tambahkan 5 variabel dari `.env.example` dengan nilai asli (ada di `.env.local` di laptop / minta orchestrator):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (rahasia — tidak pernah masuk repo/klien)
   - `CRON_SECRET`
   - `NEXT_PUBLIC_SITE_URL` (isi URL `*.vercel.app` dulu; diganti domain final di langkah E)
5. **Deploy** → tunggu ±1–2 menit → buka URL `*.vercel.app`.

## D. Verifikasi awal

- Buka `https://<nama>.vercel.app` → halaman masuk tampil.
- Daftar akun baru dengan kode undangan → email konfirmasi masuk → login.
- Login admin → `/admin` normal.

## E. Domain chatasiquqe.my.id

1. **indo.domains** → Domain Saya → **Kelola** di `chatasiquqe.my.id` → menu **DNS**:
   - Record **A**: Name `@` → Value `76.76.21.21` → TTL default.
   - Record **CNAME**: Name `www` → Value `cname.vercel-dns.com`.
2. **Vercel** → Project → **Settings → Domains** → **Add** → `chatasiquqe.my.id` → ulangi untuk `www.chatasiquqe.my.id` (redirect ke domain utama).
3. Tunggu propagasi (menit–jam). Vercel otomatis menerbitkan HTTPS.

## F. Konfigurasi pasca-domain (wajib)

1. **Supabase** → Authentication → URL Configuration:
   - **Site URL**: `https://chatasiquqe.my.id`
   - **Redirect URLs**: tambahkan `https://chatasiquqe.my.id/**` dan `https://<nama>.vercel.app/**` (biarkan `http://localhost:3000/**` untuk dev).
2. **Vercel** → Settings → Environment Variables → ubah `NEXT_PUBLIC_SITE_URL` menjadi `https://chatasiquqe.my.id` → **Redeploy** (wajib agar tautan verifikasi/reset email memakai domain final).

## G. SMTP (PRD 23.3) — sebelum mengundang banyak orang

Email bawaan Supabase dibatasi kiriman/jam. Sambungkan SMTP sendiri:
Supabase → Authentication → SMTP Settings → Expire custom SMTP (mis. Resend/Brevo) → isi kredensial → Save.

## H. Catatan

- Cron `/api/cron/cleanup` (pembersihan konten kedaluwarsa, PRD 23.4) dijadwalkan menyusul; setelah rute ada, tambah `vercel.json` cron + `CRON_SECRET` di header.
- Halaman legal `terms` & `privacy` (PRD 28) menyusul di `app/legal/`.
- Node runtime: Vercel memakai Node 20+ otomatis — warning Node 18 lokal tidak relevan di Vercel.
