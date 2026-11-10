# FASE 6 — NOTIF-AGENT (Notifikasi — Pasca-MVP 15)

## [FASE 6] NOTIF-AGENT -> ORCHESTRATOR

- **Selesai**: fitur notifikasi lengkap (PRD baris 321-329, bagian 15 Pasca-MVP "Notifikasi dan DM" — DM di luar cakupan). (1) Migrasi `0008_notifications.sql`: tabel `public.notifications` (penerima `user_id`, pelaku `actor_id` null=sistem, `tipe` check in ('komentar','balasan','vote_post','vote_comment','status_akun'), `post_id` untuk navigasi, `pesan` teks siap tampil, `is_read`, `created_at`) + 2 index ((user_id, created_at desc) dan partial index (user_id) where is_read=false) + RLS (select/update HANYA pemilik; update dibatasi kolom `is_read` lewat grant kolom pola 0003; insert/delete TIDAK diberikan ke klien) + 3 trigger security definer pengirim notifikasi: comments AFTER INSERT ('balasan' ke penulis komentar induk dan/atau 'komentar' ke penulis post, skip self, skip duplikasi penerima — bila penulis induk = penulis post kirim satu saja utamakan 'balasan', skip bila post is_deleted/is_hidden), votes AFTER INSERT (hanya value=1 → 'vote_post'/'vote_comment' ke pemilik target, skip self, skip target is_deleted/is_hidden; vote_comment mengisi post_id induknya untuk navigasi), profiles AFTER UPDATE (status berubah KE suspended/banned dan ≠ old.status → 'status_akun' ke user itu, actor null, pesan "Akunmu disuspend sampai <tanggal>" / "Akunmu diblokir. Untuk banding, hubungi admin lewat email."). (2) Server actions `lib/actions/notifications.ts` (use server, kontrak ActionResult): getNotifications (limit 20, urut created_at desc, kursor offset base64url pola posts.ts, unreadCount via head-count, tiap item camelCase + actor_username join profiles + postTersedia dari view posts_feed), markNotificationRead (uuid divalidasi, update is_read milik sendiri, 0 baris → NOT_FOUND), markAllNotificationsRead (update is_read=true semua baris sendiri yang belum dibaca), getUnreadCount (angka untuk badge). (3) UI: ikon lonceng SVG inline di header layout (link /notifikasi, badge angka unread hanya bila sesi ada, via try/catch — gagal dianggap 0), halaman `/notifikasi` (server, tamu → redirect /login, judul "Notifikasi"), `components/NotificationsList.tsx` (client: avatar pelaku/inisial "Sistem", teks pesan atau teks bawaan per tipe, waktuRelatif, item belum baca latar bg-primary/5 + titik indikator, klik item → tandai dibaca lalu router.push ke /p/<post_id> hanya bila postTersedia, tombol "Tandai semua dibaca" + router.refresh(), EmptyState "Belum ada notifikasi", "Muat lagi" bila nextCursor, error inline role=alert), tautan "Notifikasi" di footer legal.

- **File yang dibuat/diubah**:
  - supabase/migrations/0008_notifications.sql — BARU (tabel, index, RLS+grant, 3 fungsi + 3 trigger; tanpa BEGIN/COMMIT; idempoten-amann: if not exists / or replace / drop if exists).
  - supabase/tests/rls_checks.sql — DIUBAH: menambah SKENARIO 12a/12b/12c SEBELUM blok CLEANUP (pola begin/set local role/set local claims/do $$ ... exception ... rollback; setiap notice diawali OK/GAGAL). Tidak mengubah skenario lama maupun SETUP/CLEANUP.
  - lib/actions/notifications.ts — BARU ("use server"; 4 aksi; validasi uuid pola reports.ts; error NOT_FOUND/LOGIN_REQUIRED dari lib/errors.ts; env lazy).
  - app/(main)/layout.tsx — DIUBAH: import getUnreadCount, komponen IkonLonceng (SVG inline), state `unread` (hanya bila sesi, try/catch), ikon lonceng + badge dirender SEBELUM tombol "+ Buat Post", tautan "Notifikasi" di footer legal. Tidak ada perubahan perilaku lain.
  - app/(main)/notifikasi/page.tsx — BARU (server, force-dynamic via layout, metadata, tamu → redirect /login, SSR halaman pertama).
  - components/NotificationsList.tsx — BARU (client; pola FeedList: initial* dari server + useEffect sinkron saat router.refresh()).
  - docs/handoff/FASE6-NOTIFIKASI.md (file ini). TIDAK disentuh: lib/actions lain, app/admin, components/admin, components/feed (types.ts/server-data.ts hanya DIBACA sebagai pola), docs/PROGRESS.md.

- **Kontrak yang disediakan** (semua di lib/actions/notifications.ts, file "use server"):
  ```ts
  getNotifications(params?: { cursor?: string }): Promise<ActionResult<NotificationsData>>
  markNotificationRead(id: string): Promise<ActionResult<{ id: string }>>
  markAllNotificationsRead(): Promise<ActionResult<{ updated: number }>>
  getUnreadCount(): Promise<ActionResult<number>>
  type NotificationTipe = "komentar" | "balasan" | "vote_post" | "vote_comment" | "status_akun";
  interface NotificationItem { id; tipe; pesan: string | null; isRead; createdAt; postId: string | null; actorId: string | null; actorUsername: string | null; postTersedia: boolean }
  interface NotificationsData { items: NotificationItem[]; nextCursor: string | null; unreadCount: number }
  ```
  - Kode error: LOGIN_REQUIRED (tamu), NOT_FOUND (id bukan uuid / bukan milik / tidak ada), RLS_DENIED/NETWORK/UNKNOWN (pemetaan extractErrorCode).
  - DB: tabel `public.notifications` + trigger `comments_notify`, `votes_notify`, `profiles_notify_status` (fungsi `notify_on_comment`, `notify_on_vote`, `notify_on_status_change`). Klien hanya punya SELECT + UPDATE(is_read) — baris hanya dibuat trigger.
  - UI: `<NotificationsList initialItems initialCursor initialUnread initialError />` dan halaman `/notifikasi`.

- **Yang dibutuhkan dari agent lain**:
  - ORCHESTRATOR: terapkan migrasi 0008 lewat scripts/run-migrations.mjs, lalu `npm run build` dan `npm run migrate -- --tests`-style uji (atau `node scripts/run-migrations.mjs --tests`) — S12a/S12b/S12c harus terbaca OK dan total GAGAL = 0. Tidak ada dependensi paket baru.
  - QA: alur 'status_akun' diuji end-to-end via dashboard admin (suspend/ban user → user login kembali → halaman /notifikasi menampilkan pesan sanksi; format tanggal to_char 'DD Mon YYYY' berbahasa Inggris, lihat asumsi).
  - Catatan penilaian badge: badge header hanya terupdate saat render server (force-dynamic) — aksi "klik item" di halaman notifikasi TIDAK me-refresh layout otomatis (hanya tandaiSemua yang memanggil router.refresh()); navigasi ke /p/<id> memicu render ulang layout sehingga badge benar.

- **Asumsi / keputusan**:
  1. `pesan` hanya diisi trigger untuk 'status_akun'; komentar/balasan/vote disimpan tanpa pesan dan UI menyusun teks dari tipe + username pelaku ("r(_username) mengomentari postmu", dst.) — teks tidak membeku di DB (username bisa berubah, pelaku bisa dihapus → fallback "Seseorang"/"Sistem"). Ini sedikit menyimpang dari "teks siap tampil" yang hanya dicontohkan untuk status_akun.
  2. postTersedia dibaca lewat view `posts_feed` (bukan tabel posts — klien tidak punya SELECT mentah kecuali miliknya): id yang tidak kembali berarti post hidden/deleted → item tidak dinavigasi, hanya ditandai dibaca. Pengayaan (username, postTersedia) sengaja non-fatal: gagal → item tetap tampil tanpa username / tanpa tautan (konservatif untuk keamanan tautan).
  3. Cursor pagination = offset base64url {o} persis pola posts.ts; nextCursor terbit bila jumlah baris == 20. Tidak ada filter tambahan yang perlu dikirim ulang (daftar notifikasi tanpa filter), jadi pola "filter harus dikirim ulang" tidak relevan di sini.
  4. markAllNotificationsRead hanya menyentuh baris is_read=false (mengurangi write); `updated` = jumlah baris yang berubah. RLS-lah yang membatasi kepemilikan — server tidak memfilter user_id manual.
  5. getUnreadCount untuk tamu mengembalikan kegagalan LOGIN_REQUIRED (konsisten kontrak aksi lain); layout membungkusnya try/catch + fallback 0 dan HANYA memanggilnya bila sesi ada, jadi tamu tidak pernah melihat badge.
  6. Trigger vote HANYA AFTER INSERT (upvote pertama). Ganti vote -1→1 lewat UPDATE tidak memberi notifikasi (sesuai instruksi "AFTER INSERT ... hanya bila value = 1"); demote→promote ulang dengan delete+insert akan memberi notifikasi lagi — diterima sebagai perilaku wajar.
  7. Guard komentar induk: penulis induk dicari tanpa memfilter is_deleted/is_hidden (instruksi guard hanya menyebut post target); balasan ke komentar terhapus tetap mungkin lewat API langsung — dampaknya hanya satu notifikasi 'balasan', tidak berbahaya.
  8. Skenario S12 di file uji sengaja memakai data yang dibuat di dalam transaksinya sendiri (post baru milik moderator di S12c) agar tidak bergantung urutan skenario lama dan tetap aman dijalankan ulang (semua rollback). S12b menguji downvote (harus 0 notifikasi) SEBELUM upvote (harus 1) untuk menegaskan syarat value=1.
  9. Format tanggal pesan suspend memakai to_char 'DD Mon YYYY' (mis. "11 Nov 2026") — lc_time Indonesian tidak dijamin tersedia di semua instance Supabase; singkatan bulan Inggris dianggap cukup netral.
  10. Badge header memakai bg-danger + teks putih, maks "9+" agar tidak pecah; ikon lonceng SVG inline (path lucide bell) tanpa dependensi. Aria-label memuat jumlah belum dibaca untuk pembaca layar.

- **Cara memeriksa**:
  1. `node scripts/run-migrations.mjs` → "TERAPKAN: 0008_notifications.sql" (aman diulang: file idempoten); `node scripts/run-migrations.mjs --tests` → ringkasan berisi OK S12a (2 cek), OK S12b (2 cek), OK S12c (3 cek) tambahan, tidak ada GAGAL.
  2. `npm run build` lulus tanpa env asli (env lazy; layout menangani kegagalan getUnreadCount → tanpa badge).
  3. Login dua akun (A & B): B komentar post A → header A menampilkan badge lonceng bernomor; /notifikasi menampilkan item "… mengomentari postmu" dengan latar primer; klik item → tercatat dibaca (latar normal, badge berkurang) lalu pindah ke /p/<id>.
  4. B upvote post A → notifikasi "memberi upvote pada postmu"; downvote TIDAK menghasilkan notifikasi. B membalas komentar A di post A → A menerima SATU notifikasi 'balasan' (bukan dua — penulis induk = penulis post).
  5. Suspend/ban user via dashboard admin → user tersebut menemukan notifikasi "Akunmu disuspend sampai …"/"Akunmu diblokir…" dengan avatar "Sistem".
  6. Hapus post yang punya notifikasi (soft delete oleh penulis atau moderasi) → item notifikasi lama masih ada, klik hanya menandai dibaca TANPA navigasi (postTersedia=false).
  7. Halaman >20 notifikasi → tombol "Muat lagi" menambah halaman berikutnya; "Tandai semua dibaca" mengosongkan badge header setelah refresh; tamu membuka /notifikasi → diarahkan ke /login; footer memuat tautan "Notifikasi".
