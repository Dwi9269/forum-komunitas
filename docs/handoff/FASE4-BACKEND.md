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
