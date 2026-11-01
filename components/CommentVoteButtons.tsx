"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setVoteComment } from "@/lib/actions/votes";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Tombol vote komentar (PRD 4.5, 18.5) — Fase 4.
 *
 * Pola sama dengan components/VoteButtons.tsx (post) tetapi versi ringkas
 * horizontal untuk tiap komentar di CommentTree, dan memanggil
 * setVoteComment (kontrak Fase 4):
 * - Optimistic update (PRD 18.5.2): skor berubah seketika, dikembalikan bila
 *   server menolak.
 * - Klik panah yang sama lagi = batalkan vote (nilai 0, PRD 18.5.1).
 * - Skor/myVote terbaru dari hasil server dipakai bila tersedia.
 * - Tamu diarahkan ke /login; `disabled` untuk akun disuspend (PRD 18.5.4).
 */

export interface CommentVoteButtonsProps {
  commentId: string;
  initialScore?: number;
  initialMyVote?: number | null;
  /** false (tamu) → klik mengarahkan ke /login. */
  isLoggedIn?: boolean;
  /** Nonaktif (mis. akun disuspend) — PRD 18.5.4. */
  disabled?: boolean;
}

/** Baca skor terbaru dari hasil setVoteComment (kontrak: data.score / score). */
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
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      {keBawah ? <path d="m19 12-7 7-7-7" /> : <path d="m5 12 7-7 7 7" />}
      {keBawah ? <path d="M5 5v14" /> : <path d="M12 19V5" />}
    </svg>
  );
}

export default function CommentVoteButtons({
  commentId,
  initialScore = 0,
  initialMyVote = 0,
  isLoggedIn = false,
  disabled = false,
}: CommentVoteButtonsProps) {
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
      const hasil: unknown = await setVoteComment(commentId, nilaiBaru);
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
      setVoteSaya(voteLama);
      setSkor(skorLama);
      setError(extractErrorCode(err).message);
    } finally {
      setProses(false);
    }
  }

  const tombolClass = (aktif: boolean, arahBawah: boolean) =>
    `inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
      aktif
        ? arahBawah
          ? "bg-danger/10 text-danger"
          : "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background px-0.5 py-0.5">
        <button
          type="button"
          onClick={() => pilih(1)}
          disabled={disabled || proses}
          aria-pressed={voteSaya === 1}
          aria-label="Upvote komentar"
          className={tombolClass(voteSaya === 1, false)}
        >
          <IkonPanah />
        </button>
        <span
          className={`min-w-6 text-center text-xs font-semibold tabular-nums ${
            voteSaya === 1
              ? "text-primary"
              : voteSaya === -1
                ? "text-danger"
                : "text-foreground"
          }`}
          aria-live="polite"
          aria-label={`Skor komentar ${skor}`}
        >
          {skor}
        </span>
        <button
          type="button"
          onClick={() => pilih(-1)}
          disabled={disabled || proses}
          aria-pressed={voteSaya === -1}
          aria-label="Downvote komentar"
          className={tombolClass(voteSaya === -1, true)}
        >
          <IkonPanah keBawah />
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="max-w-40 text-center text-xs leading-snug text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
