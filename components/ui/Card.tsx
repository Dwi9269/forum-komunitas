import type { ComponentPropsWithRef } from "react";

export interface CardProps extends ComponentPropsWithRef<"div"> {
  /** Beri padding internal (default true). Set false bila mengatur padding sendiri. */
  padded?: boolean;
}

/** Kartu dasar: latar card, border, sudut membulat — dipakai untuk kartu post/komentar. */
export default function Card({
  padded = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-card text-card-foreground shadow-sm ${
        padded ? "p-4" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
