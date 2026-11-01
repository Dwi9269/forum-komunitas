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
