import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Judul singkat, mis. "Belum ada postingan". */
  title: string;
  /** Penjelasan opsional di bawah judul. */
  description?: string;
  /** Ikon kustom (ReactNode). Default: ikon inbox SVG inline. */
  icon?: ReactNode;
  /** Aksi opsional di bawah deskripsi, mis. tombol. */
  action?: ReactNode;
  className?: string;
}

function InboxIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10"
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

/** State kosong untuk daftar (PRD 22.5: semua daftar punya state kosong). */
export default function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center ${className}`}
    >
      <div className="text-muted-foreground" aria-hidden="true">
        {icon ?? <InboxIcon />}
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
