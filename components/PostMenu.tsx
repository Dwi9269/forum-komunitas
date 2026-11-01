"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReportDialog from "@/components/ReportDialog";
import { deleteComment } from "@/lib/actions/comments";
import { deletePost } from "@/lib/actions/posts";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Menu titik tiga untuk post & komentar (wireframe PRD 22.1-22.2, PRD 4.6 &
 * 18.3.8 / 18.4.4) — Fase 4:
 * - "Lapor" → membuka ReportDialog (semua pengguna, PRD 4.6).
 * - "Hapus" → hanya bila isMine; confirm ringan dua langkah di dalam menu,
 *   lalu deletePost/deleteComment (soft delete) → router.refresh() sehingga
 *   post hilang dari feed/detail (PRD 18.3.8) atau komentar tampil
 *   "[komentar dihapus]" (PRD 18.4.3-4).
 *
 * Dipasang di dalam Link (PostCard) maupun di luar (detail/komentar): wrapper
 * memanggil preventDefault + stopPropagation agar klik menu tidak ikut
 * membuka tautan kartu. Tanpa dependensi tambahan.
 */

export interface PostMenuProps {
  /** Jenis target laporan/penghapusan (PRD 4.6 report targetType). */
  targetType: "post" | "comment";
  /** Id post/komentar. */
  targetId: string;
  /** true → tampilkan aksi "Hapus" (pemilik konten, PRD 18.3.8 / 18.4.4). */
  isMine?: boolean;
}

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
}: PostMenuProps) {
  const router = useRouter();
  const [terbuka, setTerbuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [laporBuka, setLaporBuka] = useState(false);
  const [sudahLapor, setSudahLapor] = useState(false);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const akarRef = useRef<HTMLDivElement>(null);

  // Tutup menu saat klik di luar atau Escape.
  useEffect(() => {
    if (!terbuka) return;
    function klikLuar(event: MouseEvent) {
      if (akarRef.current && !akarRef.current.contains(event.target as Node)) {
        setTerbuka(false);
        setKonfirmasi(false);
      }
    }
    function tekanEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
  }, [terbuka]);

  function bukaMenu() {
    setTerbuka((v) => !v);
    setKonfirmasi(false);
    setError(null);
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

  return (
    <div
      ref={akarRef}
      // Cegah navigasi ketika menu berada di dalam Link kartu post.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="relative inline-flex shrink-0"
    >
      <button
        type="button"
        onClick={bukaMenu}
        disabled={proses}
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
              {isMine && (
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
