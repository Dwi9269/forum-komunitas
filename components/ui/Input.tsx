import type { ComponentPropsWithRef } from "react";

export interface InputProps extends ComponentPropsWithRef<"input"> {
  /** Label di atas input; terhubung lewat htmlFor ke id (otomatis dari `name` bila `id` tidak diberikan). */
  label?: string;
  /** Teks error di bawah input; input diberi aria-invalid dan border merah. */
  error?: string;
}

export default function Input({
  label,
  error,
  id,
  name,
  className = "",
  ...rest
}: InputProps) {
  const inputId = id ?? name;
  const errorId = error ? `${inputId ?? "input"}-error` : undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`h-11 w-full rounded-lg border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          error
            ? "border-danger focus-visible:ring-danger"
            : "border-border focus-visible:ring-ring"
        } ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
