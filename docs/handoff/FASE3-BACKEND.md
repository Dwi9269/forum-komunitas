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
