# FASE 6 — REALTIME-AGENT (Badge lonceng realtime — Pasca-MVP 15)

## [FASE 6] REALTIME-AGENT -> ORCHESTRATOR

- **Selesai**: badge lonceng notifikasi di header kini update LANGSUNG tanpa refresh halaman via Supabase Realtime `postgres_changes` (gratis, sudah aktif di project). Ikon lonceng diekstrak dari layout server menjadi komponen klien `components/NotificationBell.tsx`: layout tetap menghitung angka awal via `getUnreadCount()` (try/catch yang sudah ada, force-dynamic) dan mengirimnya sebagai prop `initialUnread` — render SSR pertama identik dengan perilaku lama. Komponen membuka channel `notifications-<userId>` di browser client (`lib/supabase/client`) dan mendengarkan dua event pada `public.notifications` dengan filter `user_id=eq.<userId>`: INSERT (`payload.new.is_read === false` → unread+1) dan UPDATE (`payload.new.is_read === true && payload.old.is_read === false` → unread-1 dengan `Math.max(0, …)`; `payload.new.is_read === false` → tidak berubah). Cleanup `removeChannel` saat unmount/userId berubah. State `unread` disinkronkan dengan prop `initialUnread` via useEffect (pola NotificationsList) sehingga `router.refresh()` tetap memperbarui badge. Navigasi TIDAK berubah: komponen hanya `<Link href="/notifikasi">` — realtime hanya mengubah angka badge. Tamu (`userId` null) → render null (lonceng hilang seperti sekarang).

- **File yang dibuat/diubah**:
  - components/NotificationBell.tsx — BARU ("use client"; props `{ userId: string | null; initialUnread: number }`; `IkonLonceng` SVG dipindah apa adanya dari layout; badge bg-danger "9+" bila unread > 9; aria-label `Notifikasi — X belum dibaca` bila > 0, "Notifikasi" bila 0; guard `if (!userId) return null` SETELAH semua hooks).
  - app/(main)/layout.tsx — DIUBAH (bagian lonceng saja): import NotificationBell, fungsi lokal `IkonLonceng` dihapus (pindah ke komponen), blok `{sesi && (<Link href="/notifikasi">…</Link>)}` diganti `<NotificationBell userId={sesi?.id ?? null} initialUnread={unread} />` (sesi null → userId null → render null). Bagian lain layout (logo, tombol Buat Post, sesi/logout, banner status, nav komunitas, BottomNav, PwaRegister, footer) TIDAK disentuh.
  - docs/handoff/FASE6-REALTIME.md (file ini). TIDAK disentuh: lib/actions/**, lib/supabase/** (cukup dibaca), components/feed/**, components/NotificationsList.tsx, supabase/**, docs/PROGRESS.md.

- **Kontrak yang disediakan**:
  ```ts
  // components/NotificationBell.tsx ("use client")
  export interface NotificationBellProps {
    /** id pengguna (profiles.id); null = tamu → komponen merender null. */
    userId: string | null;
    /** Angka belum dibaca versi server (getUnreadCount di layout). */
    initialUnread: number;
  }
  export default function NotificationBell(props: NotificationBellProps): JSX.Element | null;
  ```
  - Kontrak yang DIPAKAI (tidak diubah): `createClient(): SupabaseClient` (lib/supabase/client.ts, browser singleton), `getUnreadCount()` (lib/actions/notifications.ts), tabel `public.notifications` (migrasi 0008: `user_id`, `is_read`, trigger pengirim notifikasi).

- **Yang dibutuhkan dari agent lain**:
  - ORCHESTRATOR: `npm run build` — tidak ada dependensi baru; tipe `RealtimeChannel`/`SupabaseClient` diimpor dari `@supabase/supabase-js` v2 yang sudah terpasang. Tanpa env asli pun build/dev jalan (realtime hanya aktif saat runtime; env placeholder → komponen lanjut tanpa realtime, lihat Asumsi 3).
  - DB-AGENT (opsional, disarankan): supaya jalur DEKREMEN realtime aktif, tambahkan migrasi kecil `alter table public.notifications replica identity full;` — di luar kepemilikan saya (supabase/**). Tanpa itu badge tetap benar lewat jalur sinkronisasi prop (Asumsi 1).
  - QA: skenario dua tab di "Cara memeriksa" 3-5.

- **Asumsi / keputusan**:
  1. REPLICA IDENTITY: default Postgres untuk tabel ber-PK adalah DEFAULT → pada event UPDATE, `payload.old` dari postgres_changes hanya memuat kolom PK (`id`), TIDAK semua kolom, sehingga cek `payload.old.is_read === false` bisa tak pernah true sampai tabel diset `REPLICA IDENTITY FULL`. Logika komponen tetap ditulis persis sesuai spesifikasi; guard `Math.max(0, n-1)` mencegah angka negatif. Dampak tanpa migrasi: dekrement realtime tak aktif, tetapi badge tetap benar karena klik item di /notifikasi → `router.push` (render ulang layout → `initialUnread` baru) dan "Tandai semua dibaca" → `router.refresh()` → sinkronisasi prop.
  2. Sinkronisasi state ← prop (`useEffect` pada `initialUnread`): tanpa ini `useState(initialUnread)` tidak menangkap render ulang layout setelah `router.refresh()` — badge justru bisa basi (regresi dari perilaku server-rendered lama). Pola `initial*` + sinkronisasi sama dengan components/NotificationsList.tsx.
  3. `createClient()` dibungkus try/catch DI DALAM effect: bila env kredensial masih placeholder, klien gagal dibuat dan komponen lanjut tanpa realtime (tidak crash) — konsisten pola env-lazy lib/supabase/client.ts dan try/catch `getUnreadCount` di layout.
  4. Tidak ada query notifications lain di klien (tanpa SELECT head-count manual): sumber angka hanya event channel + prop dari server, sesuai instruksi. Keamanan diserahkan ke RLS: postgres_changes menghormati RLS — Supabase hanya mengirim baris milik pengguna yang sedang login di klien tersebut.
  5. Tampilan dipertahankan persis perilaku lama: unread > 0 → badge `bg-danger` (angka, "9+" bila > 9) + aria-label menyebut jumlah; unread === 0 → tanpa badge, aria-label "Notifikasi".
  6. Tamu: layout memanggil komponen tanpa kondisi (`userId={sesi?.id ?? null}`); guard null berada SETELAH semua hooks (aturan hooks) — DOM untuk tamu sama persis dengan sebelumnya (tanpa elemen lonceng).
  7. Nama channel `notifications-<userId>` per klien browser: dua tab akun sama punya instance client/socket masing-masing sehingga tidak saling mengganggu; filter `user_id=eq.<userId>` memastikan hanya event miliknya.
  8. INSERT dengan `is_read === true` tidak menambah badge (trigger 0008 memang selalu membuat `is_read=false`, tetapi cek tetap dilakukan untuk ketahanan terhadap perubahan trigger).
  9. Realtime tidak pernah memanggil router/link — navigasi lonceng murni `<Link href="/notifikasi">` (guard instruksi 3).

- **Cara memeriksa**:
  1. `npm run build` lulus tanpa dependensi baru; dengan env placeholder halaman tetap jalan (badge statis dari server, tanpa realtime — try/catch di effect).
  2. Login DUA AKUN BERBEDA: akun A (tab 1), akun B (tab 2). Trigger 0008 skip self-notify, jadi A berkomentar di post milik A sendiri TIDAK menaikkan badge — uji harus lintas akun.
  3. Dua tab: B berkomentar/memberi upvote di post A → badge lonceng di tab A bertambah TANPA refresh halaman (INSERT postgres_changes).
  4. Tab A buka /notifikasi: klik item → tercatat dibaca lalu navigasi ke /p/<id> (badge layout benar dari render server); "Tandai semua dibaca" → router.refresh() → badge header kosong TANPA pindah halaman (sinkronisasi prop).
  5. (Bila migrasi `replica identity full` diterapkan) dua tab akun A: tandai dibaca di tab 2 → badge tab 1 ikut berkurang realtime via event UPDATE.
  6. Logout → header tanpa lonceng (komponen render null) seperti sebelumnya; > 9 belum dibaca → badge "9+"; inspektur elemen: `<a href="/notifikasi" aria-label="Notifikasi — X belum dibaca">`.
