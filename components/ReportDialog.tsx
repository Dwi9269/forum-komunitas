"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { report } from "@/lib/actions/reports";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Dialog "Laporkan" untuk post/komentar — Fase 4 (MOD), dipakai FRONTEND-AGENT
 * di menu titik tiga post/komentar (PRD 4.6, 18.6.1).
 *
 * KONTRAK PROP (jangan diubah — disepakati lintas agent):
 *   targetType : "post" | "comment"
 *   targetId   : string (uuid post/komentar)
 *   open       : boolean (true → dialog tampil)
 *   onClose    : () => void
 *   onReported?: () => void (opsional, dipanggil setelah laporan sukses)
 *
 * Alasan mengikuti nilai yang diterima kolom reports.reason (PRD 4.6):
 * spam | porn | violence_sara | doxxing | other. Sukses → pesan
 * "Laporan terkirim. Terima kasih." lalu dialog menutup sendiri.
 */

const ALASAN_LAPOR: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "porn", label: "Porno / konten dewasa" },
  { value: "violence_sara", label: "SARA / kekerasan" },
  { value: "doxxing", label: "Doxxing (membocorkan data pribadi)" },
  { value: "other", label: "Lainnya" },
];

/** Batas catatan — sama dengan trim backend lib/actions/reports.ts (1000). */
const CATATAN_MAKS = 1000;

/** Jeda pesan sukses sebelum dialog menutup sendiri (ms). */
const JEDA_SUKSES_MS = 1600;

export interface ReportDialogProps {
  targetType: "post" | "comment";
  targetId: string;
  open: boolean;
  onClose: () => void;
  onReported?: () => void;
}

export default function ReportDialog({
  targetType,
  targetId,
  open,
  onClose,
  onReported,
}: ReportDialogProps) {
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState(false);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buka dialog dari nol setiap kali `open` berubah true.
  useEffect(() => {
    if (open) {
      setAlasan("");
      setCatatan("");
      setError(null);
      setSukses(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open]);

  // Escape menutup (kecuali sedang mengirim).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || sukses) return;
    if (!alasan) {
      setError("Pilih salah satu alasan laporan.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const hasil = await report({
          targetType,
          targetId,
          reason: alasan,
          note: catatan.trim() ? catatan.trim() : undefined,
        });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setError(gagal);
          return;
        }
        // Sukses (PRD 18.6.1): tampilkan ucapan terima kasih, lalu tutup.
        setSukses(true);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          onClose();
          onReported?.();
        }, JEDA_SUKSES_MS);
      } catch (err) {
        setError(extractErrorCode(err).message);
      }
    });
  }

  // Portal ke document.body: dialog sering dipasang DI DALAM Link kartu post
  // (lewat PostMenu) yang menelepon preventDefault pada setiap klik untuk
  // mencegah navigasi kartu — bila dialog berada di bawahnya, preventDefault
  // itu ikut membatalkan aksi bawaan klik: radio alasan tak bisa dipilih dan
  // tombol kirim tidak menyubmit form. Dengan portal, dialog keluar dari DOM
  // Link/pembungkus dan semua kontrol bekerja normal.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={() => {
        if (!pending && !sukses) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id="report-dialog-title"
            className="text-base font-semibold text-foreground"
          >
            Laporkan {targetType === "post" ? "post" : "komentar"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending || sukses}
            aria-label="Tutup dialog laporan"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {sukses ? (
          <div
            role="status"
            className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-6 text-center"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-success"
              aria-hidden="true"
            >
              <path d="M21.8 10A10 10 0 1 1 17 3.34" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            <p className="text-sm font-medium text-foreground">
              Laporan terkirim. Terima kasih.
            </p>
          </div>
        ) : (
          <form onSubmit={kirim} noValidate className="mt-3 flex flex-col gap-3">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
            )}

            <fieldset className="flex flex-col gap-1.5" disabled={pending}>
              <legend className="mb-1 text-sm font-medium text-foreground">
                Alasan laporan
              </legend>
              {ALASAN_LAPOR.map((pilihan) => {
                const terpilih = alasan === pilihan.value;
                return (
                  <label
                    key={pilihan.value}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                      terpilih
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-foreground hover:border-ring/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="alasan-laporan"
                      value={pilihan.value}
                      checked={terpilih}
                      onChange={() => setAlasan(pilihan.value)}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <span>{pilihan.label}</span>
                  </label>
                );
              })}
            </fieldset>

            <Textarea
              name="catatan-laporan"
              label="Catatan (opsional)"
              placeholder="Tambahkan detail bila perlu..."
              value={catatan}
              maxLength={CATATAN_MAKS}
              onChange={(e) => setCatatan(e.target.value)}
              disabled={pending}
              className="min-h-20"
            />

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                {catatan.length}/{CATATAN_MAKS.toLocaleString("id-ID")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  disabled={pending}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={pending}
                  disabled={pending || !alasan}
                >
                  Kirim laporan
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
