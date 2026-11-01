import type { ReactNode } from "react";

export interface AuthSuccessProps {
  /** Judul layar sukses, mis. "Cek email kamu untuk verifikasi". */
  title: string;
  children?: ReactNode;
}

/** Panel layar sukses untuk alur auth (register / reset password / ganti password). */
export default function AuthSuccess({ title, children }: AuthSuccessProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-6 py-8 text-center"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children && (
        <div className="text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
