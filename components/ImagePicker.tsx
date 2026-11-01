"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import Button from "@/components/ui/Button";
import {
  FOTO_ERROR_MESSAGES,
  validateImageFile,
  type FotoErrorCode,
} from "@/lib/image/compress";

/**
 * ImagePicker — pemilih & pratinjau foto (PRD 4.7, 9, 22, 25.6).
 *
 * - Mode post: beberapa foto (maks 4, hitungan "2/4"), pratinjau kisi.
 * - Mode avatar (`single`): satu foto bulat, pilihan baru mengganti lama.
 * - Validasi awal TANPA kompres: tipe tidak didukung dan file mentah
 *   > 10 MB langsung ditolak dengan pesan inline.
 * - Pratinjau memakai URL.createObjectURL dan di-revoke saat daftar
 *   berubah / komponen dilepas (PRD 25.6.2).
 *
 * Komponen ini TIDAK memanggil Supabase: upload dilakukan pemanggil lewat
 * lib/image/upload.ts setelah form dikirim (aturan: komponen tidak
 * mengakses database/storage langsung).
 */

export interface ImagePickerProps {
  /** Daftar file terpilih — state milik pemanggil (controlled). */
  files: File[];
  /** Dipanggil dengan daftar file baru setiap tambah/hapus. */
  onChange: (files: File[]) => void;
  /** Batas jumlah foto (mode banyak). Default 4. */
  max?: number;
  /** Nonaktifkan pemilih & tombol hapus (mis. saat submit berjalan). */
  disabled?: boolean;
  /** Mode satu foto (avatar): pilihan baru mengganti yang lama. */
  single?: boolean;
}

/** Format ukuran file untuk keterangan pratinjau. */
function formatUkuran(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Ambil pesan ramah dari error alur foto (tanpa detail teknis). */
function pesanFoto(error: unknown): string {
  const kode = (error as { code?: unknown } | null)?.code;
  if (typeof kode === "string" && kode in FOTO_ERROR_MESSAGES) {
    return FOTO_ERROR_MESSAGES[kode as FotoErrorCode];
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Foto tidak bisa diproses. Coba pilih foto lain.";
}

export default function ImagePicker({
  files,
  onChange,
  max = 4,
  disabled = false,
  single = false,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<string[]>([]);

  // Pratinjau: satu object URL per file, revoke semua URL lama setiap kali
  // daftar berubah maupun saat komponen dilepas (cleanup effect).
  useEffect(() => {
    const berikutnya = files.map((file) => URL.createObjectURL(file));
    setUrls(berikutnya);
    return () => {
      for (const url of berikutnya) {
        URL.revokeObjectURL(url);
      }
    };
  }, [files]);

  function pilih(daftar: FileList | null) {
    if (!daftar || daftar.length === 0 || disabled) {
      return;
    }
    setError(null);

    const masuk = single ? [daftar[0]] : Array.from(daftar);
    const sisa = single ? 1 : max - files.length;
    if (masuk.length > sisa) {
      setError(
        single
          ? "Pilih satu foto saja."
          : `Maksimal ${max} foto. Kurangi pilihan atau hapus foto yang sudah ada.`,
      );
      return;
    }

    // Penolakan cepat sebelum kompres: tipe & ukuran mentah > 10 MB.
    for (const file of masuk) {
      try {
        validateImageFile(file);
      } catch (err) {
        setError(pesanFoto(err));
        return;
      }
    }

    onChange(single ? masuk : [...files, ...masuk]);
  }

  function ganti(event: ChangeEvent<HTMLInputElement>) {
    pilih(event.target.files);
    event.target.value = ""; // izinkan memilih file yang sama lagi
  }

  function hapus(indeks: number) {
    setError(null);
    onChange(files.filter((_, i) => i !== indeks));
  }

  const kosong = files.length === 0;

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Area pilih foto */}
      {(kosong || !single) && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label={single ? "Pilih foto profil" : "Pilih foto"}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card px-3 text-center transition-colors hover:border-ring hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xl font-medium text-secondary-foreground"
          >
            +
          </span>
          <span className="text-sm font-medium text-foreground">
            {single ? "Pilih foto profil" : "Tambah foto"}
          </span>
          <span className="text-xs text-muted-foreground">
            JPG, PNG, atau WebP · maks 10 MB per foto
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple={!single}
        onChange={ganti}
        disabled={disabled}
        className="hidden"
      />

      {/* Pratinjau */}
      {files.length > 0 && (
        <ul
          className={
            single
              ? "flex justify-center"
              : "grid grid-cols-2 gap-2 sm:grid-cols-4"
          }
        >
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className={single ? "flex flex-col items-center gap-2" : "relative"}
            >
              {/* <img> sengaja dipakai (pratinjau blob lokal, pola yang sama
                  dengan ui/Avatar — tanpa konfigurasi domain next/image). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[i]}
                alt={`Pratinjau ${file.name}`}
                width={single ? 128 : 96}
                height={single ? 128 : 96}
                loading="lazy"
                className={
                  single
                    ? "h-32 w-32 rounded-full border border-border object-cover"
                    : "h-24 w-full rounded-lg border border-border object-cover"
                }
              />
              {!single && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {file.name} · {formatUkuran(file.size)}
                </p>
              )}
              <button
                type="button"
                onClick={() => hapus(i)}
                disabled={disabled}
                aria-label={`Hapus foto ${file.name}`}
                className={
                  single
                    ? "inline-flex h-9 items-center rounded-lg bg-danger px-3 text-sm font-medium text-danger-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                    : "absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-danger-foreground opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                {single ? (
                  "Hapus"
                ) : (
                  <span aria-hidden="true" className="text-base leading-none">
                    ×
                  </span>
                )}
              </button>
              {single && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                >
                  Ganti foto
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Hitungan & pesan error inline */}
      <div className="flex items-center justify-between gap-2">
        {!single && (
          <span className="text-xs text-muted-foreground">
            {files.length}/{max} foto
          </span>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
