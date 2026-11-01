"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import { createComment } from "@/lib/actions/comments";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Form komentar / balasan (PRD 4.4, 18.4.1): 1–5.000 karakter.
 * Tamu tidak sampai ke form ini — halaman induk menampilkan ajakan login.
 * Setelah sukses: form kosong, router.refresh() memuat ulang data server
 * sehingga komentar tampil di posisi yang benar (urutan skor + waktu, PRD 18.4.5).
 */

const BATAS_KARAKTER = 5000;
const PESAN_KOSONG = "Komentar tidak boleh kosong.";
const PESAN_PANJANG = "Komentar maksimal 5.000 karakter.";

export interface CommentFormProps {
  postId: string;
  /** Diberikan bila ini adalah balasan pada komentar tertentu. */
  parentId?: string;
  autoFocus?: boolean;
  placeholder?: string;
  /** Mode ringkas untuk form balasan di dalam pohon komentar. */
  compact?: boolean;
  /** Dipanggil setelah sukses (mis. menutup form balasan). */
  onSelesai?: () => void;
}

export default function CommentForm({
  postId,
  parentId,
  autoFocus = false,
  placeholder = "Tulis komentar...",
  compact = false,
  onSelesai,
}: CommentFormProps) {
  const router = useRouter();
  const [isi, setIsi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const teks = isi.trim(); // trim sebelum validasi (PRD 20.8)
    if (!teks) {
      setError(PESAN_KOSONG);
      return;
    }
    if (teks.length > BATAS_KARAKTER) {
      setError(PESAN_PANJANG);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const hasil: unknown = await createComment({
          postId,
          parentId,
          body: teks,
        });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setError(gagal);
          return;
        }
        setIsi("");
        onSelesai?.();
        router.refresh();
      } catch (err) {
        setError(extractErrorCode(err).message);
      }
    });
  }

  return (
    <form
      onSubmit={kirim}
      noValidate
      className={compact ? "mt-2 flex flex-col gap-2" : "flex flex-col gap-3"}
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <Textarea
        name="komentar"
        value={isi}
        onChange={(e) => {
          setIsi(e.target.value);
          if (error) setError(null);
        }}
        placeholder={placeholder}
        aria-label={parentId ? "Tulis balasan" : "Tulis komentar"}
        maxLength={BATAS_KARAKTER}
        autoFocus={autoFocus}
        disabled={pending}
        className={compact ? "min-h-20" : "min-h-24"}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {isi.length}/{BATAS_KARAKTER.toLocaleString("id-ID")}
        </span>
        <div className="flex items-center gap-2">
          {onSelesai && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSelesai}
              disabled={pending}
            >
              Batal
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            loading={pending}
            disabled={pending || !isi.trim()}
          >
            Kirim
          </Button>
        </div>
      </div>
    </form>
  );
}
