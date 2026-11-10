"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReportDialog from "@/components/ReportDialog";
import { deleteComment } from "@/lib/actions/comments";
import { deletePost } from "@/lib/actions/posts";
import { modApplyAction } from "@/lib/actions/admin";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Menu titik tiga untuk post & komentar (wireframe PRD 22.1-22.2, PRD 4.6 &
 * 18.3.8 / 18.4.4) — Fase 4 + Fase 6 (takedown langsung):
 * - "Lapor" → membuka ReportDialog (semua pengguna, PRD 4.6).
 * - "Hapus" → hanya bila isMine (dan bukan moderator); confirm ringan dua
 *   langkah di dalam menu, lalu deletePost/deleteComment (soft delete) →
 *   router.refresh() sehingga post hilang dari feed/detail (PRD 18.3.8) atau
 *   komentar tampil "[komentar dihapus]" (PRD 18.4.3-4).
 * - Fase 6 (takedown langsung): bila viewerRole moderator/admin, menu juga
 *   menampilkan "Sembunyikan" (hide) dan "Hapus" (delete) via server action
 *   modApplyAction (PRD 4.6) — tidak perlu menunggu laporan. Keduanya lewat
 *   dialog konfirmasi ringan (tiruan pola components/admin/ConfirmDialog,
 *   ditiru inline agar tidak mencampur area) + kolom alasan opsional; alasan
 *   kosong dikirim sebagai "Takedown langsung oleh moderator". Sukses →
 *   pesan singkat di menu + router.refresh(); gagal → pesan error di dialog.
 *   Tidak ada aksi "Pulihkan" di menu: konten tersembunyi/terhapus tidak
 *   tampil di feed/detail (view posts_feed memfilter), pemulihan tetap di
 *   dashboard admin. Server tetap SATU-SATUNYA penjaga (FORBIDDEN untuk
 *   non-moderator) — pengetatan UI ini hanya kosmetik.
 *
 * Dipasang di dalam Link (PostCard) maupun di luar (detail/komentar): wrapper
 * memanggil preventDefault + stopPropagation agar klik menu tidak ikut
 * membuka tautan kartu. Dialog moderasi dirender INLINE (bukan portal) dan
 * hanya memakai tombol type="button" + onClick, sehingga preventDefault
 * wrapper tidak mengganggu input alasan. Tanpa dependensi tambahan.
 */

export type ViewerRole = "member" | "moderator" | "admin";

export interface PostMenuProps {
  /** Jenis target laporan/moderasi (PRD 4.6 targetType). */
  targetType: "post" | "comment";
  /** Id post/komentar. */
  targetId: string;
  /** true → tampilkan aksi "Hapus" (pemilik konten, PRD 18.3.8 / 18.4.4). */
  isMine?: boolean;
  /**
   * Role penampil (dari ambilSesi/getSessionUser di halaman server).
   * "moderator"|"admin" → menu punya aksi moderasi langsung (Fase 6);
   * "member" (default, termasuk tamu) → tanpa aksi moderasi.
   */
  viewerRole?: ViewerRole;
}

/** Alasan default bila moderator mengosongkan kolom alasan (Fase 6). */
const ALASAN_TAKEDOWN_BAWAAN = "Takedown langsung oleh moderator";

function IkonTitikTiga() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export default function PostMenu({
  targetType,
  targetId,
  isMine = false,
  viewerRole = "member",
}: PostMenuProps) {
  const router = useRouter();
  const [terbuka, setTerbuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [laporBuka, setLaporBuka] = useState(false);
  const [sudahLapor, setSudahLapor] = useState(false);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fase 6: dialog moderasi langsung (null = tertutup).
  const [modAksi, setModAksi] = useState<"hide" | "delete" | null>(null);
  const [modAlasan, setModAlasan] = useState("");
  const [modProses, setModProses] = useState(false);
  const [modError, setModError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const akarRef = useRef<HTMLDivElement>(null);
  const idJudulDialog = useId();
  const idAlasanDialog = useId();

  const moderator = viewerRole === "moderator" || viewerRole === "admin";

  // Tutup menu saat klik di luar atau Escape.
  useEffect(() => {
    if (!terbuka) return;
    function klikLuar(event: MouseEvent) {
      if (akarRef.current && !akarRef.current.contains(event.target as Node)) {
        setTerbuka(false);
        setKonfirmasi(false);
        setModAksi(null);
      }
    }
    function tekanEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Dialog moderasi terbuka → Escape menutup dialognya saja (menu tetap),
        // dan TIDAK menutup apa pun di tengah proses agar aksi tidak "hilang".
        if (modAksi !== null) {
          if (!modProses) {
            setModAksi(null);
            setModAlasan("");
            setModError(null);
          }
          return;
        }
        setTerbuka(false);
        setKonfirmasi(false);
      }
    }
    document.addEventListener("mousedown", klikLuar);
    document.addEventListener("keydown", tekanEscape);
    return () => {
      document.removeEventListener("mousedown", klikLuar);
      document.removeEventListener("keydown", tekanEscape);
    };
  }, [terbuka, modAksi, modProses]);

  function bukaMenu() {
    setTerbuka((v) => !v);
    setKonfirmasi(false);
    setError(null);
    setSukses(null);
  }

  /** Buka dialog moderasi (menu tetap terbuka di balik overlay). */
  function bukaDialogMod(aksi: "hide" | "delete") {
    setModAksi(aksi);
    setModAlasan("");
    setModError(null);
    setSukses(null);
  }

  /** Tutup dialog moderasi (dinonaktifkan saat sedang memproses). */
  function tutupDialogMod() {
    if (modProses) return;
    setModAksi(null);
    setModAlasan("");
    setModError(null);
  }

  async function hapus() {
    if (proses) return;
    setProses(true);
    setError(null);
    try {
      const hasil: unknown =
        targetType === "post"
          ? await deletePost(targetId)
          : await deleteComment(targetId);
      const gagal = pesanGagalHasil(hasil);
      if (gagal) {
        setError(gagal);
        setProses(false);
        return;
      }
      setTerbuka(false);
      setProses(false);
      router.refresh();
    } catch (err) {
      setError(extractErrorCode(err).message);
      setProses(false);
    }
  }

  /** Takedown langsung (Fase 6): hide/delete via modApplyAction (PRD 4.6). */
  async function moderasi() {
    if (modAksi === null || modProses) return;
    const aksi = modAksi;
    setModProses(true);
    setModError(null);
    try {
      const hasil: unknown = await modApplyAction({
        action: aksi,
        targetType,
        targetId,
        // Alasan wajib non-kosong: kosong → default (kontrak Fase 6).
        reason:
          modAlasan.trim() !== "" ? modAlasan.trim() : ALASAN_TAKEDOWN_BAWAAN,
      });
      const gagal = pesanGagalHasil(hasil);
      if (gagal) {
        setModError(gagal);
        setModProses(false);
        return;
      }
      setModAksi(null);
      setModAlasan("");
      setModProses(false);
      // Pesan sukses tampil di menu; router.refresh() menyegarkan feed/detail
      // (konten hilang dari view posts_feed / komentar jadi "[komentar dihapus]").
      setSukses(
        aksi === "hide"
          ? targetType === "post"
            ? "Post disembunyikan"
            : "Komentar disembunyikan"
          : "Konten dihapus",
      );
      router.refresh();
    } catch (err) {
      setModError(extractErrorCode(err).message);
      setModProses(false);
    }
  }

  const labelTarget = targetType === "post" ? "post" : "komentar";

  return (
    <div
      ref={akarRef}
      data-post-menu-root=""
      // Cegah navigasi ketika menu berada di dalam Link kartu post. PENTING:
      // hanya untuk klik yang DOM-nya di dalam pembungkus ini (pemicu + popup
      // menu + dialog moderasi). Konten ReportDialog dirender via portal ke
      // document.body — event React-nya TETAP naik lewat pohon komponen sampai
      // ke sini, tapi DOM-nya tidak; preventDefault tanpa syarat akan
      // membatalkan aksi bawaan klik dialog (radio alasan & submit form).
      onClick={(e) => {
        const sumber = e.target as HTMLElement | null;
        if (sumber && sumber.closest("[data-post-menu-root]")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="relative inline-flex shrink-0"
    >
      <button
        type="button"
        onClick={bukaMenu}
        disabled={proses || modProses}
        aria-haspopup="menu"
        aria-expanded={terbuka}
        aria-label={
          targetType === "post" ? "Menu post" : "Menu komentar"
        }
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IkonTitikTiga />
      </button>

      {terbuka && (
        <div
          role="menu"
          aria-label={
            targetType === "post"
              ? "Aksi post"
              : "Aksi komentar"
          }
          className="absolute right-0 top-8 z-30 flex w-44 flex-col rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {error && (
            <p
              role="alert"
              className="px-2.5 py-1.5 text-xs leading-snug text-danger"
            >
              {error}
            </p>
          )}
          {sukses && (
            <p
              role="status"
              className="px-2.5 py-1.5 text-xs leading-snug text-success"
            >
              {sukses}
            </p>
          )}

          {!konfirmasi ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTerbuka(false);
                  setError(null);
                  setLaporBuka(true);
                }}
                className="rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lapor
              </button>
              {/* Hapus milik sendiri hanya untuk member — moderator/admin
                  memakai "Hapus" moderasi di bawah (tercatat di mod_actions,
                  laporan open otomatis selesai) agar tidak ada dua "Hapus". */}
              {isMine && !moderator && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setKonfirmasi(true);
                    setError(null);
                  }}
                  className="rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                >
                  Hapus
                </button>
              )}
              {/* Fase 6 — takedown langsung (moderator/admin, PRD 4.6). */}
              {moderator && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => bukaDialogMod("hide")}
                  className="rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Sembunyikan
                </button>
              )}
              {moderator && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => bukaDialogMod("delete")}
                  className="rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                >
                  Hapus
                </button>
              )}
              {sudahLapor && (
                <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                  Laporan terkirim. Terima kasih.
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
              <p className="text-xs font-medium leading-snug text-foreground">
                {targetType === "post"
                  ? "Hapus post ini?"
                  : "Hapus komentar ini?"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={hapus}
                  disabled={proses}
                  className="inline-flex h-7 items-center rounded-lg bg-danger px-2.5 text-xs font-medium text-danger-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {proses ? "Menghapus..." : "Ya, hapus"}
                </button>
                <button
                  type="button"
                  onClick={() => setKonfirmasi(false)}
                  disabled={proses}
                  className="inline-flex h-7 items-center rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fase 6 — dialog konfirmasi takedown langsung (moderator/admin).
          Tiruan inline pola components/admin/ConfirmDialog.tsx (tanpa impor
          agar tidak mencampur area admin): overlay fixed, tutup lewat Batal /
          klik latar / Escape (nonaktif saat memproses). Dirender INLINE (bukan
          portal) agar klik di dalamnya tetap DOM-di dalam akar menu — klik
          luar menu tidak menutup apa pun di tengah pengisian alasan. */}
      {modAksi !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onMouseDown={() => {
            if (!modProses) tutupDialogMod();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={idJudulDialog}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg"
          >
            <h2
              id={idJudulDialog}
              tabIndex={-1}
              className="text-base font-semibold text-foreground focus-visible:outline-none"
            >
              {modAksi === "hide"
                ? `Sembunyikan ${labelTarget} ini?`
                : `Hapus ${labelTarget} ini?`}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {modAksi === "hide"
                ? targetType === "post"
                  ? "Post disembunyikan dari feed dan detail; laporan terkait otomatis selesai. Pemulihan lewat dashboard admin."
                  : "Komentar disembunyikan dan tampil sebagai [komentar dihapus]. Pemulihan lewat dashboard admin."
                : targetType === "post"
                  ? "Post ditandai terhapus dan tidak tampil lagi di forum. Pemulihan lewat dashboard admin."
                  : "Komentar ditandai terhapus dan tampil sebagai [komentar dihapus]. Pemulihan lewat dashboard admin."}
              {" "}Tindakan tercatat di log moderasi.
            </p>
            {modError && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {modError}
              </div>
            )}
            <label
              htmlFor={idAlasanDialog}
              className="mt-3 block text-sm font-medium text-foreground"
            >
              Alasan (opsional)
            </label>
            <input
              id={idAlasanDialog}
              type="text"
              value={modAlasan}
              onChange={(e) => setModAlasan(e.target.value)}
              placeholder={ALASAN_TAKEDOWN_BAWAAN}
              maxLength={300}
              disabled={modProses}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={tutupDialogMod}
                disabled={modProses}
                className="inline-flex h-8 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={moderasi}
                disabled={modProses}
                className="inline-flex h-8 items-center rounded-lg bg-danger px-3 text-sm font-medium text-danger-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modProses
                  ? "Memproses..."
                  : modAksi === "hide"
                    ? "Ya, sembunyikan"
                    : "Ya, hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportDialog
        targetType={targetType}
        targetId={targetId}
        open={laporBuka}
        onClose={() => setLaporBuka(false)}
        onReported={() => {
          setLaporBuka(false);
          setSudahLapor(true);
        }}
      />
    </div>
  );
}
