"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setVotePost } from "@/lib/actions/votes";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Tombol vote post (PRD 4.5, 18.5): up/down, satu suara per pengguna per item.
 *
 * - Optimistic update (PRD 18.5.2): skor berubah seketika, dikembalikan bila
 *   server menolak (aturan skill: simpan nilai lama, pulihkan saat gagal).
 * - Klik panah yang sama lagi = batalkan vote (nilai 0, PRD 18.5.1).
 * - Tamu diarahkan ke /login; `disabled` untuk akun disuspend (PRD 18.5.4).
 */

export interface VoteButtonsProps {
  postId: string;
  initialScore?: number;
  initialMyVote?: number | null;
  /** false (tamu) → klik mengarahkan ke /login. */
  isLoggedIn?: boolean;
  /** Nonaktif (mis. akun disuspend) — PRD 18.5.4. */
  disabled?: boolean;
}

/** Baca skor terbaru dari hasil setVote (kontrak: skor & jumlah terbaru). */
function bacaSkorBaru(hasil: unknown): number | null {
  const rekam = typeof hasil === "object" && hasil !== null ? (hasil as Record<string, unknown>) : null;
  const data = typeof rekam?.data === "object" && rekam.data !== null ? (rekam.data as Record<string, unknown>) : null;
  const kandidat = [data?.score, data?.skor, rekam?.score, rekam?.skor];
  for (const nilai of kandidat) {
    if (typeof nilai === "number" && Number.isFinite(nilai)) return nilai;
  }
  return null;
}

function IkonPanah({ keBawah = false }: { keBawah?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      {keBawah ? <path d="m19 12-7 7-7-7" /> : <path d="m5 12 7-7 7 7" />}
      {keBawah ? <path d="M5 5v14" /> : <path d="M12 19V5" />}
    </svg>
  );
}

export default function VoteButtons({
  postId,
  initialScore = 0,
  initialMyVote = 0,
  isLoggedIn = false,
  disabled = false,
}: VoteButtonsProps) {
  const router = useRouter();
  const [skor, setSkor] = useState(initialScore);
  const [voteSaya, setVoteSaya] = useState(
    Math.max(-1, Math.min(1, Math.round(initialMyVote ?? 0))),
  );
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pilih(arah: 1 | -1) {
    if (proses || disabled) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    const nilaiBaru = voteSaya === arah ? 0 : arah;
    const skorLama = skor;
    const voteLama = voteSaya;

    // Optimistic: ubah tampilan seketika (PRD 18.5.2).
    setVoteSaya(nilaiBaru);
    setSkor(skorLama - voteLama + nilaiBaru);
    setProses(true);
    setError(null);

    try {
      const hasil: unknown = await setVotePost(postId, nilaiBaru);
      const gagal = pesanGagalHasil(hasil);
      if (gagal) {
        // Server menolak → pulihkan nilai lama (PRD 18.5.2).
        setVoteSaya(voteLama);
        setSkor(skorLama);
        setError(gagal);
        return;
      }
      const skorServer = bacaSkorBaru(hasil);
      if (skorServer !== null) setSkor(skorServer);
    } catch (err) {
      // Server menolak → pulihkan nilai lama (PRD 18.5.2).
      setVoteSaya(voteLama);
      setSkor(skorLama);
      setError(extractErrorCode(err).message);
    } finally {
      setProses(false);
    }
  }

  const tombolClass = (aktif: boolean, arahBawah: boolean) =>
    `inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
      aktif
        ? arahBawah
          ? "bg-danger/10 text-danger"
          : "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-1 py-0.5">
        <button
          type="button"
          onClick={() => pilih(1)}
          disabled={disabled || proses}
          aria-pressed={voteSaya === 1}
          aria-label="Upvote"
          className={tombolClass(voteSaya === 1, false)}
        >
          <IkonPanah />
        </button>
        <span
          className={`min-w-8 text-center text-sm font-semibold tabular-nums ${
            voteSaya === 1
              ? "text-primary"
              : voteSaya === -1
                ? "text-danger"
                : "text-foreground"
          }`}
          aria-live="polite"
          aria-label={`Skor ${skor}`}
        >
          {skor}
        </span>
        <button
          type="button"
          onClick={() => pilih(-1)}
          disabled={disabled || proses}
          aria-pressed={voteSaya === -1}
          aria-label="Downvote"
          className={tombolClass(voteSaya === -1, true)}
        >
          <IkonPanah keBawah />
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-48 text-xs leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
