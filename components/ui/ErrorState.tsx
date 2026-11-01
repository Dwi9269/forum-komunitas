import Button from "./Button";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Bila diberikan, tampilkan tombol "Coba lagi". Karena membawa fungsi,
   *  ErrorState dengan onRetry hanya dapat dipakai dari Client Component. */
  onRetry?: () => void;
  className?: string;
}

function AlertIcon() {
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
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** State error untuk daftar/muat data (PRD 22.5: error dengan tombol coba lagi). */
export default function ErrorState({
  title = "Terjadi kesalahan",
  message = "Gagal memuat data. Silakan coba lagi.",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-6 py-12 text-center ${className}`}
    >
      <div className="text-danger" aria-hidden="true">
        <AlertIcon />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {message && (
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      )}
      {onRetry && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      )}
    </div>
  );
}
