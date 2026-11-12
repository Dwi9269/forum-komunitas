"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  VIDEO_RAW_MAX_BYTES,
  isVideoError,
} from "@/lib/image/video";

/**
 * VideoPicker — pemilih & pratinjau SATU video opsional (Pasca-MVP 15,
 * PRD bagian 15: video pendek 30-60 detik, 1 video per post).
 *
 * - Area pilih file video/* + pratinjau <video controls> + tombol hapus.
 * - Validasi awal TANPA kompres: tipe bukan video/* dan file mentah
 *   > 30 MB langsung ditolak dengan pesan inline (kompres sendiri terjadi
 *   saat Kirim via kompresVideo — lib/image/video.ts).
 * - Pratinjau memakai URL.createObjectURL dan di-revoke saat file berubah /
 *   komponen dilepas (pola ImagePicker, PRD 25.6.2).
 *
 * Komponen ini TIDAK mengunggah apa pun: kompres + upload dilakukan pemanggil
 * (SubmitPostForm) setelah form dikirim (aturan: komponen tidak mengakses
 * database/storage langsung).
 */

export interface VideoPickerProps {
  /** File video terpilih — state milik pemanggil (controlled); null = kosong. */
  file: File | null;
  /** Dipanggil dengan File baru (null bila dihapus / file tak valid). */
  onChange: (file: File | null) => void;
  /** Nonaktifkan pemilih & tombol hapus (mis. saat submit berjalan). */
  disabled?: boolean;
}

/** Format ukuran file untuk keterangan pratinjau (pola ImagePicker). */
function formatUkuran(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Ambil pesan ramah dari error alur video (tanpa detail teknis). */
function pesanVideo(error: unknown): string {
  if (isVideoError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Video tidak bisa diproses. Coba pilih video lain.";
}

export default function VideoPicker({
  file,
  onChange,
  disabled = false,
}: VideoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // Pratinjau: satu object URL untuk file aktif, revoke saat file berubah
  // maupun saat komponen dilepas (cleanup effect).
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const berikutnya = URL.createObjectURL(file);
    setUrl(berikutnya);
    return () => {
      URL.revokeObjectURL(berikutnya);
    };
  }, [file]);

  function ganti(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const masuk = event.target.files?.[0] ?? null;
    event.target.value = ""; // izinkan memilih file yang sama lagi
    if (!masuk || disabled) return;

    // Penolakan cepat sebelum kompres: tipe video/* & ukuran mentah <= 30 MB.
    const tipe = masuk.type || "";
    if (!tipe.startsWith("video/")) {
      setError(pesanVideo(new Error("Format video tidak didukung. Gunakan MP4, WebM, atau MOV.")));
      return;
    }
    if (masuk.size > VIDEO_RAW_MAX_BYTES) {
      setError(pesanVideo(new Error("Ukuran video maksimal 30 MB. Pilih video yang lebih kecil.")));
      return;
    }
    onChange(masuk);
  }

  function hapus() {
    setError(null);
    onChange(null);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Area pilih video (disembunyikan saat sudah ada video) */}
      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label="Pilih video"
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card px-3 text-center transition-colors hover:border-ring hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xl font-medium text-secondary-foreground"
          >
            +
          </span>
          <span className="text-sm font-medium text-foreground">Tambah video</span>
          <span className="text-xs text-muted-foreground">
            Video 30-60 detik, dikompres otomatis · maks 30 MB
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="video/*"
        onChange={ganti}
        disabled={disabled}
        className="hidden"
      />

      {/* Pratinjau pemutar + tombol hapus */}
      {file && url && (
        <div className="flex flex-col gap-2">
          {/* <video> sengaja native (pratinjau blob lokal); tanpa autoplay. */}
          <video
            controls
            preload="metadata"
            src={url}
            className="w-full rounded-lg border border-border"
            aria-label={`Pratinjau video ${file.name}`}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {file.name} · {formatUkuran(file.size)}
            </p>
            <button
              type="button"
              onClick={hapus}
              disabled={disabled}
              aria-label={`Hapus video ${file.name}`}
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-danger px-3 text-sm font-medium text-danger-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hapus
            </button>
          </div>
        </div>
      )}

      {/* Bantuan + pesan error inline */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Video 30-60 detik, dikompres otomatis saat dikirim
        </span>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
