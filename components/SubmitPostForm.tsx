"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { createPost } from "@/lib/actions/posts";
import { getCommunities } from "@/lib/actions/communities";
import { extractErrorCode } from "@/lib/errors";
import {
  bacaIdDariHasil,
  pesanGagalHasil,
  toCommunityViews,
} from "@/components/feed/types";

/**
 * Form buat post (wireframe PRD 22.3, validasi PRD 21 & 18.3):
 * - Pilih komunitas (wajib), judul 1–200 (Kirim nonaktif saat kosong, PRD
 *   18.3.2, dengan penghitung n/200), isi maksimal 10.000, checkbox
 *   "Posting sebagai anonim" (PRD 4.3 — anonim hanya untuk post, bukan komentar).
 * - TANPA upload foto (foto baru di Fase 4); status proses "Menyimpan...".
 * - Sukses → diarahkan ke halaman detail post (PRD 18.3.1).
 */

const JUDUL_MAKS = 200;
const ISI_MAKS = 10_000;

const PESAN_JUDUL_KOSONG = "Judul wajib diisi.";
const PESAN_JUDUL_PANJANG = "Judul maksimal 200 karakter.";
const PESAN_KOMUNITAS = "Pilih komunitas tujuan post.";
const PESAN_ISI_KOSONG = "Isi post wajib diisi.";
const PESAN_ISI_PANJANG = "Isi post maksimal 10.000 karakter.";

export interface SubmitPostFormProps {
  communities: { slug: string; name: string }[];
  /** Pesan error bila daftar komunitas gagal dimuat di server. */
  communitiesError: string | null;
  /** Bila diisi → form nonaktif dengan penjelasan (mis. akun disuspend). */
  alasanNonaktif?: string | null;
}

export default function SubmitPostForm({
  communities,
  communitiesError,
  alasanNonaktif = null,
}: SubmitPostFormProps) {
  const router = useRouter();
  const [daftar, setDaftar] = useState(communities);
  const [errorDaftar, setErrorDaftar] = useState<string | null>(communitiesError);
  const [muatUlangDaftar, setMuatUlangDaftar] = useState(false);

  const [komunitas, setKomunitas] = useState("");
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [anonim, setAnonim] = useState(false);

  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorKomunitas, setErrorKomunitas] = useState<string | null>(null);
  const [errorJudul, setErrorJudul] = useState<string | null>(null);
  const [errorIsi, setErrorIsi] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nonaktif = Boolean(alasanNonaktif);
  // PRD 18.3.2: judul kosong → tombol Kirim nonaktif.
  const kirimNonaktif =
    nonaktif || pending || judul.trim().length === 0 || komunitas === "";

  /** Coba muat ulang daftar komunitas dari klien (server action). */
  async function muatKomunitas() {
    setMuatUlangDaftar(true);
    setErrorDaftar(null);
    try {
      const hasil: unknown = await getCommunities();
      const view = toCommunityViews(hasil);
      if (view.length === 0) {
        setErrorDaftar("Daftar komunitas belum tersedia.");
        return;
      }
      setDaftar(view.map((k) => ({ slug: k.slug, name: k.name })));
    } catch (err) {
      setErrorDaftar(extractErrorCode(err).message);
    } finally {
      setMuatUlangDaftar(false);
    }
  }

  function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const judulBersih = judul.trim(); // trim sebelum validasi (PRD 20.8)
    const isiBersih = isi.trim();

    setErrorForm(null);
    let valid = true;
    if (!komunitas) {
      setErrorKomunitas(PESAN_KOMUNITAS);
      valid = false;
    } else {
      setErrorKomunitas(null);
    }
    if (!judulBersih) {
      setErrorJudul(PESAN_JUDUL_KOSONG);
      valid = false;
    } else if (judulBersih.length > JUDUL_MAKS) {
      setErrorJudul(PESAN_JUDUL_PANJANG);
      valid = false;
    } else {
      setErrorJudul(null);
    }
    if (!isiBersih) {
      setErrorIsi(PESAN_ISI_KOSONG);
      valid = false;
    } else if (isiBersih.length > ISI_MAKS) {
      setErrorIsi(PESAN_ISI_PANJANG);
      valid = false;
    } else {
      setErrorIsi(null);
    }
    if (!valid) return;

    startTransition(async () => {
      try {
        const hasil: unknown = await createPost({
          communitySlug: komunitas,
          title: judulBersih,
          body: isiBersih,
          isAnonymous: anonim,
        });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setErrorForm(gagal);
          return;
        }
        // Sukses → diarahkan ke detail post (PRD 18.3.1).
        const id = bacaIdDariHasil(hasil);
        router.replace(id ? `/p/${encodeURIComponent(id)}` : "/");
        router.refresh();
      } catch (err) {
        setErrorForm(extractErrorCode(err).message);
      }
    });
  }

  return (
    <form onSubmit={kirim} noValidate className="flex flex-col gap-5">
      {nonaktif && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning"
        >
          {alasanNonaktif}
        </div>
      )}

      {errorForm && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {errorForm}
        </div>
      )}

      {/* Komunitas (wireframe 22.3: Komunitas: [ Umum v ]) */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="komunitas"
          className="text-sm font-medium text-foreground"
        >
          Komunitas
        </label>
        {errorDaftar ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
            <span>Gagal memuat daftar komunitas: {errorDaftar}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={muatKomunitas}
              loading={muatUlangDaftar}
            >
              Muat ulang
            </Button>
          </div>
        ) : (
          <select
            id="komunitas"
            name="komunitas"
            value={komunitas}
            onChange={(e) => {
              setKomunitas(e.target.value);
              if (errorKomunitas) setErrorKomunitas(null);
            }}
            disabled={nonaktif || pending || daftar.length === 0}
            aria-invalid={errorKomunitas ? true : undefined}
            className="h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {daftar.length === 0
                ? "Belum ada komunitas"
                : "Pilih komunitas..."}
            </option>
            {daftar.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.name}
              </option>
            ))}
          </select>
        )}
        {errorKomunitas && (
          <p className="text-sm text-danger">{errorKomunitas}</p>
        )}
      </div>

      {/* Judul + penghitung n/200 (wireframe 22.3) */}
      <div className="flex flex-col gap-1">
        <Input
          label="Judul"
          name="judul"
          value={judul}
          onChange={(e) => {
            setJudul(e.target.value);
            if (errorJudul) setErrorJudul(null);
          }}
          placeholder="Judul post"
          maxLength={JUDUL_MAKS}
          error={errorJudul ?? undefined}
          disabled={nonaktif || pending}
        />
        <span
          className="self-end text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {judul.length}/{JUDUL_MAKS}
        </span>
      </div>

      {/* Isi */}
      <div className="flex flex-col gap-1">
        <Textarea
          label="Isi"
          name="isi"
          value={isi}
          onChange={(e) => {
            setIsi(e.target.value);
            if (errorIsi) setErrorIsi(null);
          }}
          placeholder="Tulis isi postmu di sini..."
          rows={6}
          maxLength={ISI_MAKS}
          error={errorIsi ?? undefined}
          disabled={nonaktif || pending}
        />
        <span
          className="self-end text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {isi.length}/{ISI_MAKS.toLocaleString("id-ID")}
        </span>
      </div>

      {/* Foto (maks 4) baru di Fase 4 — sengaja belum ada di form ini. */}

      {/* Anonim (PRD 4.3: hanya untuk post, bukan komentar) */}
      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          name="anonim"
          checked={anonim}
          onChange={(e) => setAnonim(e.target.checked)}
          disabled={nonaktif || pending}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--color-primary))]"
        />
        <span>Posting sebagai anonim</span>
      </label>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Dengan memposting kamu setuju pada aturan komunitas.
      </p>

      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={kirimNonaktif}
        className="self-end"
      >
        Kirim
      </Button>
    </form>
  );
}
