import Link from "next/link";

/**
 * Banner status akun (PRD 19: Kena suspend / Kena banned).
 *
 * - suspend → banner merah: akunmu disuspend sampai tanggal tertentu,
 *   alasan, dan tautan "Baca aturan".
 * - banned → banner: akunmu diblokir, alasan, dan alamat email banding.
 *
 * Komponen murni (tanpa state, tanpa 'use client') sehingga bisa dipakai
 * dari server component — rencananya dipasang oleh layout utama (main) di
 * fase berikutnya saat status profil terbaca (PRD 20.2: banner tampil tanpa
 * perlu logout bila akun kena suspend di tengah sesi).
 */

export type AccountStatus = "suspended" | "banned";

export interface AccountStatusBannerProps {
  status: AccountStatus;
  /** Untuk suspend: sampai kapan penangguhan berlaku (ISO string, Date, atau angka epoch). */
  suspendedUntil?: string | number | Date | null;
  /** Alasan penindakan dari moderator/admin. */
  reason?: string | null;
  /** Untuk banned: alamat email tujuan pengajuan banding. */
  appealEmail?: string | null;
  /** Tautan halaman aturan komunitas (default "/rules"). */
  rulesHref?: string;
}

function formatTanggal(nilai: string | number | Date): string {
  const tanggal = new Date(nilai);
  if (Number.isNaN(tanggal.getTime())) return String(nilai);
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
    tanggal,
  );
}

export default function AccountStatusBanner({
  status,
  suspendedUntil = null,
  reason = null,
  appealEmail = null,
  rulesHref = "/rules",
}: AccountStatusBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-relaxed text-danger"
    >
      {status === "suspended" ? (
        <>
          <p className="font-semibold">
            {suspendedUntil
              ? `Akunmu disuspend sampai ${formatTanggal(suspendedUntil)}.`
              : "Akunmu disuspend."}
          </p>
          {reason && (
            <p>
              Alasan: <span className="font-medium">{reason}</span>
            </p>
          )}
          <p>
            Selama disuspend, kamu tidak bisa menulis post, komentar, atau
            vote.
          </p>
          <Link
            href={rulesHref}
            className="mt-1 inline-flex w-fit items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
          >
            Baca aturan
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </>
      ) : (
        <>
          <p className="font-semibold">Akunmu diblokir (banned).</p>
          {reason && (
            <p>
              Alasan: <span className="font-medium">{reason}</span>
            </p>
          )}
          {appealEmail ? (
            <p>
              Ajukan banding lewat email ke{" "}
              <a
                href={`mailto:${appealEmail}`}
                className="font-semibold underline underline-offset-2 hover:no-underline"
              >
                {appealEmail}
              </a>
              . Banding ditinjau admin secara manual.
            </p>
          ) : (
            <p>
              Ajukan banding lewat email admin. Banding ditinjau secara
              manual.
            </p>
          )}
        </>
      )}
    </div>
  );
}
