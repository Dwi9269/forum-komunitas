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
