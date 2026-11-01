"use client";

import { useEffect, useRef } from "react";
import Button from "@/components/ui/Button";

/**
 * Dialog konfirmasi sederhana untuk aksi admin (suspend/blokir/reaktivasi,
 * hapus konten) — modal ringan tanpa dependensi (PRD 22.5).
 * Tutup lewat tombol Batal, klik latar, atau Escape (nonaktif saat loading
 * agar aksi tidak "hilang" di tengah proses).
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Penjelasan konsekuensi aksi di bawah judul. */
  description?: string;
  /** Label tombol konfirmasi (default "Ya, lanjutkan"). */
  confirmLabel?: string;
  /** Label tombol batal (default "Batal"). */
  cancelLabel?: string;
  /** true → tombol konfirmasi memakai varian danger (merah). */
  danger?: boolean;
  /** true → tombol konfirmasi tampil loading dan tutup dinonaktifkan. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const refJudul = useRef<HTMLHeadingElement>(null);

  // Escape menutup dialog (kecuali sedang loading) + fokus ke judul saat buka.
  useEffect(() => {
    if (!open) return;
    refJudul.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg"
      >
        <h2
          id="confirm-dialog-title"
          tabIndex={-1}
          ref={refJudul}
          className="text-base font-semibold text-foreground focus-visible:outline-none"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
