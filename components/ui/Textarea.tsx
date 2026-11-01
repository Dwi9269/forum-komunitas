import type { ComponentPropsWithRef } from "react";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  /** Label di atas textarea; terhubung lewat htmlFor ke id (otomatis dari `name` bila `id` tidak diberikan). */
  label?: string;
  /** Teks error di bawah textarea; textarea diberi aria-invalid dan border merah. */
  error?: string;
}

export default function Textarea({
  label,
  error,
  id,
  name,
  className = "",
  ...rest
}: TextareaProps) {
  const textareaId = id ?? name;
  const errorId = error ? `${textareaId ?? "textarea"}-error` : undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-28 w-full rounded-lg border bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
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
