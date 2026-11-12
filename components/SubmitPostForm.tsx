"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import Textarea from "@/components/ui/Textarea";
import ImagePicker from "@/components/ImagePicker";
import VideoPicker from "@/components/VideoPicker";
import { createPost } from "@/lib/actions/posts";
import { getCommunities } from "@/lib/actions/communities";
import { hapusVideo, uploadVideo } from "@/lib/actions/media";
import { deletePostImage, uploadPostImage } from "@/lib/image/upload";
import { isFotoError } from "@/lib/image/compress";
import { isVideoError, kompresVideo } from "@/lib/image/video";
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
 * - FOTO (Fase 4, PRD 4.7 / 18.3.3-5 / 18.7 / 25): ImagePicker maks 4 foto;
 *   saat submit tiap foto dikompres + diunggah lebih dulu (uploadPostImage —
 *   kompres terjadi di dalamnya, PRD 25.2) lalu path-nya dikirim ke
 *   createPost({ images: paths }).
 *   - Progres tampil: "Mengunggah foto 2/4..." lalu "Menyimpan post...".
 *   - Satu upload gagal → error inline, foto lain yang sudah sukses tetap
 *     dipakai, tombol Kirim bisa dicoba lagi (hanya foto yang gagal yang
 *     diunggah ulang — PRD 18.3.4); post TIDAK tersimpan setengah-setengah.
 *   - createPost gagal setelah upload sukses → file yatim di-rollback lewat
 *     deletePostImage (PRD 20 kasus tepi 3 / 25.4), foto perlu diunggah ulang.
 *   - Akun < 24 jam ditolak storage (PRD 18.3.10) → pesan jelas tampil inline.
 * - VIDEO (Fase 6, Pasca-MVP 15, PRD bagian 15): VideoPicker SATU video
 *   opsional; foto dan video saling EKSKLUSIF (ada video → foto
 *   dinonaktifkan, dan sebaliknya — catatan kecil tampil di form).
 *   Alur kirim video: kompresVideo (klien, canvas 480p + MediaRecorder) →
 *   uploadVideo (server action ke Vercel Blob) → createPost({ videoUrl }).
 *   - Progres tampil: "Mengompres video..." → "Mengunggah video..." →
 *     "Menyimpan post...".
 *   - Kompres/upload video gagal → error inline + tombol "Kirim tanpa video"
 *     (video dibuang, post tetap bisa dikirim).
 *   - createPost gagal setelah video terunggah → hapusVideo (rollback, pola
 *     PRD 25.4).
 * - Sukses → diarahkan ke halaman detail post (PRD 18.3.1).
 */

const JUDUL_MAKS = 200;
const ISI_MAKS = 10_000;
const FOTO_MAKS = 4;

const PESAN_JUDUL_KOSONG = "Judul wajib diisi.";
const PESAN_JUDUL_PANJANG = "Judul maksimal 200 karakter.";
const PESAN_KOMUNITAS = "Pilih komunitas tujuan post.";
const PESAN_ISI_KOSONG = "Isi post wajib diisi.";
const PESAN_ISI_PANJANG = "Isi post maksimal 10.000 karakter.";

/** PRD 18.3.10: akun berumur < 24 jam belum boleh mengunggah foto. */
const PESAN_AKUN_BARU_24JAM =
  "Foto belum bisa diunggah: akun baru dapat mengunggah foto setelah berumur 24 jam. Kamu masih bisa mengirim post tanpa foto.";

export interface SubmitPostFormProps {
  communities: { slug: string; name: string }[];
  /** Pesan error bila daftar komunitas gagal dimuat di server. */
  communitiesError: string | null;
  /** Bila diisi → form nonaktif dengan penjelasan (mis. akun disuspend). */
  alasanNonaktif?: string | null;
  /**
   * Bila diisi → pemilih foto dinonaktifkan dengan alasan ini
   * (PRD 18.3.10 — akun < 24 jam; diisi halaman /submit bila sesi sudah
   * menyertakan tanggal pembuatan akun).
   */
  alasanFotoNonaktif?: string | null;
}

/** Pesan ramah untuk error alur foto/upload (tanpa detail teknis). */
function pesanGagalFoto(error: unknown): string {
  if (isFotoError(error)) return error.message;
  return extractErrorCode(error).message;
}

/** Pesan ramah untuk error alur video (tanpa detail teknis). */
function pesanGagalVideo(error: unknown): string {
  if (isVideoError(error)) return error.message;
  return extractErrorCode(error).message;
}

/** Baca data.url dari hasil uploadVideo (kontrak ActionResult, longgar). */
function bacaUrlVideo(hasil: unknown): string | null {
  const rekam = hasil as { data?: { url?: unknown } } | null;
  const url = rekam?.data?.url;
  return typeof url === "string" && url ? url : null;
}

/** Kode yang menandakan storage menolak upload (policy akun < 24 jam). */
function ditolakStorage(error: unknown): boolean {
  const kode = (error as { code?: unknown } | null)?.code;
  return kode === "FORBIDDEN" || kode === "RLS_DENIED";
}

export default function SubmitPostForm({
  communities,
  communitiesError,
  alasanNonaktif = null,
  alasanFotoNonaktif = null,
}: SubmitPostFormProps) {
  const router = useRouter();
  const [daftar, setDaftar] = useState(communities);
  const [errorDaftar, setErrorDaftar] = useState<string | null>(communitiesError);
  const [muatUlangDaftar, setMuatUlangDaftar] = useState(false);

  const [komunitas, setKomunitas] = useState("");
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [anonim, setAnonim] = useState(false);

  // Foto: daftar file terpilih + path storage per posisi (null = belum terunggah).
  const [files, setFiles] = useState<File[]>([]);
  const [paths, setPaths] = useState<(string | null)[]>([]);

  // Video (Fase 6, Pasca-MVP 15): SATU video opsional. Foto dan video saling
  // eksklusif — memilih salah satu menonaktifkan/membersihkan yang lain.
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorKomunitas, setErrorKomunitas] = useState<string | null>(null);
  const [errorJudul, setErrorJudul] = useState<string | null>(null);
  const [errorIsi, setErrorIsi] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [errorVideo, setErrorVideo] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nonaktif = Boolean(alasanNonaktif);
  const fotoNonaktif = nonaktif || Boolean(alasanFotoNonaktif);
  // Eksklusivitas foto vs video: ada video → foto tak bisa dipilih, dan
  // sebaliknya (keputusan Fase 6 — PRD 4.3 belum mendefinisikan gabungan).
  const fotoTerblokirVideo = videoFile !== null;
  const videoTerblokirFoto = files.length > 0;
  // PRD 18.3.2: judul kosong → tombol Kirim nonaktif.
  const kirimNonaktif =
    nonaktif || pending || judul.trim().length === 0 || komunitas === "";

  /** Ganti daftar foto; path lama tetap dipakai untuk file yang sama. Ada
   *  foto → video opsional dibuang (saling eksklusif). */
  function gantiFiles(berikut: File[]) {
    setFiles(berikut);
    setPaths(
      berikut.map((file) => {
        const indeks = files.findIndex((lama) => lama === file);
        return indeks >= 0 ? (paths[indeks] ?? null) : null;
      }),
    );
    if (berikut.length > 0) {
      setVideoFile(null);
      setErrorVideo(null);
    }
  }

  /** Ganti video opsional; ada video → daftar foto dibersihkan. */
  function gantiVideo(file: File | null) {
    setVideoFile(file);
    if (file) {
      setFiles([]);
      setPaths([]);
      setErrorFoto(null);
    }
    setErrorVideo(null);
  }

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

  /** Rollback file terunggah bila langkah berikutnya gagal (PRD 25.4). */
  async function batalkanUnggahan(unggahan: (string | null)[]) {
    await Promise.allSettled(
      unggahan
        .filter((path): path is string => Boolean(path))
        .map((path) => deletePostImage(path)),
    );
  }

  /** Rollback video terunggah bila createPost gagal (pola PRD 25.4, Fase 6). */
  async function batalkanVideo(url: string | null) {
    if (!url) return;
    await Promise.allSettled([hapusVideo(url)]);
  }

  function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    kirimPost(false);
  }

  /**
   * Validasi lalu kirim post. `abaikanVideo = true` dipakai tombol
   * "Kirim tanpa video" setelah video gagal dikompres/diunggah.
   */
  function kirimPost(abaikanVideo: boolean) {
    const judulBersih = judul.trim(); // trim sebelum validasi (PRD 20.8)
    const isiBersih = isi.trim();

    setErrorForm(null);
    setErrorFoto(null);
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
      // Pelacak unggahan untuk rollback bila langkah setelahnya gagal
      // (PRD 20 kasus tepi 3 / 25.4).
      let unggahan: (string | null)[] = paths;
      let videoTerunggah: string | null = null;
      try {
        // 1) VIDEO (Fase 6, Pasca-MVP 15) — kompres di klien lalu upload ke
        //    Vercel Blob; URL dikirim ke createPost (pola PRD 25.4).
        let videoUrl: string | undefined;
        const videoAktif = abaikanVideo ? null : videoFile;
        if (videoAktif) {
          setStatus("Mengompres video...");
          let videoHasil: File;
          try {
            videoHasil = await kompresVideo(videoAktif);
          } catch (err) {
            setErrorVideo(
              `Gagal mengompres video: ${pesanGagalVideo(err)} Coba kirim lagi, atau kirim tanpa video di bawah.`,
            );
            setStatus(null);
            return;
          }
          setStatus("Mengunggah video...");
          const formData = new FormData();
          formData.append("file", videoHasil);
          const hasilVideo: unknown = await uploadVideo(formData);
          const urlVideo = bacaUrlVideo(hasilVideo);
          if (!urlVideo) {
            // ActionResult gagal { ok:false, code, message } (mis. token Blob
            // belum terpasang, ukuran > 8 MB setelah kompres) atau bentuk
            // tak terduga — tampilkan pesan ramah + opsi kirim tanpa video.
            setErrorVideo(
              `${pesanGagalHasil(hasilVideo) ?? "Gagal mengunggah video."} Kamu bisa kirim tanpa video di bawah.`,
            );
            setStatus(null);
            return;
          }
          videoTerunggah = urlVideo; // dicatat untuk rollback
          videoUrl = urlVideo;
        }

        // 2) Unggah foto yang belum punya path (retry hanya foto gagal —
        //    PRD 18.3.4). Kompres + upload dalam satu panggilan per foto.
        //    (Foto dan video saling eksklusif — keduanya tak pernah bersama.)
        const pathsBaru = [...paths];
        for (let i = 0; i < files.length; i += 1) {
          if (pathsBaru[i]) continue;
          setStatus(
            files.length > 1
              ? `Mengunggah foto ${i + 1}/${files.length}...`
              : "Mengunggah foto...",
          );
          try {
            pathsBaru[i] = await uploadPostImage(files[i]);
          } catch (err) {
            setPaths(pathsBaru); // simpan yang sudah sukses
            if (ditolakStorage(err)) {
              setErrorFoto(PESAN_AKUN_BARU_24JAM);
            } else {
              const posisi =
                files.length > 1 ? ` (foto ${i + 1}/${files.length})` : "";
              setErrorFoto(
                `Gagal mengunggah foto${posisi}: ${pesanGagalFoto(err)} Coba kirim lagi — foto yang sudah berhasil tidak diunggah ulang.`,
              );
            }
            setStatus(null);
            return; // post tidak tersimpan setengah-setengah (PRD 18.3.4)
          }
        }
        setPaths(pathsBaru);
        unggahan = pathsBaru;

        // 3) Simpan post dengan path foto (bukan URL) — PRD 25.3 — dan
        //    videoUrl bila ada (Pasca-MVP 15; kolom posts.video_url).
        setStatus("Menyimpan post...");
        const gambar = pathsBaru.filter((path): path is string =>
          Boolean(path),
        );
        const argumen = {
          communitySlug: komunitas,
          title: judulBersih,
          body: isiBersih,
          isAnonymous: anonim,
          images: gambar,
          videoUrl,
        };
        const hasil: unknown = await createPost(argumen);
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          // Upload sukses tetapi simpan post gagal → hapus file yatim
          // (PRD 20 kasus tepi 3); foto/video diunggah ulang saat retry.
          await batalkanUnggahan(pathsBaru);
          await batalkanVideo(videoTerunggah);
          setPaths(pathsBaru.map(() => null));
          setErrorForm(gagal);
          setStatus(null);
          return;
        }

        // Sukses → diarahkan ke detail post (PRD 18.3.1).
        const id = bacaIdDariHasil(hasil);
        router.replace(id ? `/p/${encodeURIComponent(id)}` : "/");
        router.refresh();
      } catch (err) {
        // createPost melempar (mis. jaringan) setelah foto/video terunggah →
        // rollback file yatim; diunggah ulang saat dicoba lagi.
        await batalkanUnggahan(unggahan);
        await batalkanVideo(videoTerunggah);
        setPaths(unggahan.map(() => null));
        setErrorForm(extractErrorCode(err).message);
        setStatus(null);
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

      {/* Foto (maks 4 — PRD 18.3.5 / 18.7 / 25): pratinjau + hapus per foto
          ditangani ImagePicker; kompres + upload terjadi saat Kirim.
          Nonaktif bila video terpilih (foto vs video saling eksklusif). */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Foto{" "}
          <span className="font-normal text-muted-foreground">
            (opsional, maks {FOTO_MAKS})
          </span>
        </span>
        {alasanFotoNonaktif ? (
          <p
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning"
          >
            {alasanFotoNonaktif}
          </p>
        ) : (
          <ImagePicker
            files={files}
            onChange={gantiFiles}
            max={FOTO_MAKS}
            disabled={nonaktif || pending || fotoTerblokirVideo}
          />
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Foto dikompres otomatis di perangkatmu sebelum diunggah (JPG, PNG,
          WebP — maks 10 MB per foto).
        </p>
        {errorFoto && (
          <p role="alert" className="text-sm leading-relaxed text-danger">
            {errorFoto}
          </p>
        )}
      </div>

      {/* Video (Pasca-MVP 15, Fase 6): SATU video opsional 30-60 detik,
          dikompres di klien saat Kirim (kompresVideo → uploadVideo →
          createPost). Saling eksklusif dengan foto. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Video{" "}
          <span className="font-normal text-muted-foreground">
            (opsional, maks 1)
          </span>
        </span>
        <VideoPicker
          file={videoFile}
          onChange={gantiVideo}
          disabled={nonaktif || pending || videoTerblokirFoto}
        />
        {(fotoTerblokirVideo || videoTerblokirFoto) && (
          <p className="text-xs leading-relaxed text-warning">
            Foto dan video tidak bisa digabung dalam satu post — pilih salah
            satu.
          </p>
        )}
        {errorVideo && (
          <p role="alert" className="text-sm leading-relaxed text-danger">
            {errorVideo}
          </p>
        )}
        {errorVideo && videoFile && !pending && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => kirimPost(true)}
            className="self-start"
          >
            Kirim tanpa video
          </Button>
        )}
      </div>

      {/* Progres kirim (dipakai alur foto & video): "Mengompres video..." →
          "Mengunggah video..." → "Menyimpan post..."; aria-live agar pembaca
          layar mendengar perubahan status. */}
      {status && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner size="sm" label={status} />
          {status}
        </p>
      )}

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
