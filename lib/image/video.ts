/**
 * Kompres video pendek di sisi klien SEBELUM upload — Pasca-MVP 15
 * (PRD bagian 15: video 30-60 detik, 1 video per post, dikompres di klien).
 *
 * Hanya boleh dipakai dari komponen klien (browser): memakai <video> tersembunyi,
 * <canvas>, captureStream, dan MediaRecorder. Modul tetap build-safe (tidak ada
 * efek samping saat import); pemanggilan kompresVideo di server melempar error.
 *
 * Ringkasan alur:
 *  1. Validasi awal: tipe video/* dan ukuran mentah <= 30 MB.
 *  2. Durasi dibaca dari metadata video; > 61 detik -> VIDEO_DURATION.
 *  3. Dekode: video diputar frame-per-frame ke <canvas> 480p (lebar 480,
 *     tinggi proporsional) -> canvas.captureStream(30).
 *  4. Rekam dengan MediaRecorder pada 400 kbps, mimeType prioritas:
 *     video/webm;codecs=vp9 -> video/webm;codecs=vp8 -> video/mp4.
 *     Perekaman berhenti saat video selesai / maksimum 61 detik.
 *  5. Hasil: File baru (webm/mp4) ukuran jauh lebih kecil, siap uploadVideo.
 *
 * Batasan (keputusan Fase 6): MediaRecorder pada captureStream canvas HANYA
 * merekam gambar — audio asli tidak dibawa ke hasil kompres. Video pendek
 * forum dipakai tanpa suara (lihat docs/handoff/FASE6-VIDEO.md).
 *
 * Error dilempar sebagai `Error` dengan properti `code` berkode VIDEO_*
 * (terdaftar di lib/errors.ts); message sudah ramah bahasa Indonesia.
 */

/** Ukuran file video mentah maksimal sebelum diproses (30 MB). */
export const VIDEO_RAW_MAX_BYTES = 30 * 1024 * 1024;

/**
 * Batas ukuran file untuk upload TANPA kompres (harus ≤ batas server 8 MB).
 * Bila kompres gagal di perangkat (sering di browser HP) dan video asli masih
 * muat, video asli diunggah langsung sebagai fallback.
 */
export const VIDEO_UPLOAD_MAKS_BYTES = 8 * 1024 * 1024;

/** Durasi maksimum yang diproses (61 detik — PRD 15: video 30-60 detik). */
export const VIDEO_DURASI_MAKS_DETIK = 61;

/** Bitrate perekaman (400 kbps — cukup untuk 480p video pendek). */
const VIDEO_BITRATE = 400_000;

/** FPS captureStream (PRD keputusan Fase 6). */
const VIDEO_FPS = 30;

/** Lebar kanvas hasil kompres (480p, tinggi proporsional). */
const VIDEO_LEBAR_KANVAS = 480;

/** Prioritas mimeType perekaman: VP9 -> VP8 -> MP4 (PRD keputusan Fase 6). */
const MIME_PRIORITAS = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/mp4",
] as const;

/** Kode error alur video. Didaftarkan juga di lib/errors.ts. */
export type VideoErrorCode =
  | "VIDEO_INVALID" // format tidak didukung / browser tak mendukung rekaman
  | "VIDEO_TOO_LARGE" // file mentah > 30 MB (klien) / hasil > 8 MB (server)
  | "VIDEO_DURATION"; // durasi > 61 detik

/** Pesan ramah untuk tiap kode (gaya tabel PRD 20). */
export const VIDEO_ERROR_MESSAGES: Record<VideoErrorCode, string> = {
  VIDEO_INVALID: "Format video tidak didukung.",
  VIDEO_TOO_LARGE: "Ukuran video maksimal 30 MB. Pilih video yang lebih kecil.",
  VIDEO_DURATION: "Video maksimal 60 detik.",
};

/** Error alur video: `Error` biasa plus properti `code` agar dikenali UI. */
export type VideoError = Error & { code: VideoErrorCode | (string & {}) };

/**
 * Buat error berkode. `message` boleh dikosongkan untuk memakai pesan ramah
 * bawaan VIDEO_ERROR_MESSAGES (tanpa detail teknis, PRD 20).
 */
export function videoError(code: string, message?: string): VideoError {
  const error = new Error(
    message ??
      VIDEO_ERROR_MESSAGES[code as VideoErrorCode] ??
      "Video tidak bisa diproses. Coba lagi.",
  ) as VideoError;
  error.code = code;
  return error;
}

/** Type guard: apakah ini error alur video (berkode VIDEO_*)? */
export function isVideoError(error: unknown): error is VideoError {
  return (
    error instanceof Error &&
    typeof (error as unknown as { code?: unknown }).code === "string" &&
    (error as unknown as { code: string }).code.startsWith("VIDEO_")
  );
}

/** Tebak MIME video dari ekstensi nama file (fallback bila file.type kosong). */
function tipeDariNama(nama: string): string {
  const ekstensi = nama.split(".").pop()?.toLowerCase() ?? "";
  const peta: Record<string, string> = {
    webm: "video/webm",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
  };
  return peta[ekstensi] ?? "";
}

/** Pilih mimeType pertama yang didukung browser untuk MediaRecorder. */
function pilihMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return null;
  }
  for (const mime of MIME_PRIORITAS) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // lanjut ke kandidat berikutnya
    }
  }
  return null;
}

/** Ekstensi file hasil dari mimeType perekaman. */
function ekstensiDariMime(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

/** Baca durasi video (detik) dari metadata; null bila tidak bisa dibaca. */
function bacaDurasi(video: HTMLVideoElement): Promise<number | null> {
  return new Promise((resolve) => {
    const selesai = (nilai: number | null) => {
      video.removeEventListener("loadedmetadata", onLoad);
      video.removeEventListener("error", onError);
      resolve(nilai);
    };
    const onLoad = () => {
      const durasi = video.duration;
      selesai(Number.isFinite(durasi) && durasi > 0 ? durasi : null);
    };
    const onError = () => selesai(null);
    video.addEventListener("loadedmetadata", onLoad, { once: true });
    video.addEventListener("error", onError, { once: true });
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoad();
    }
  });
}

/**
 * Kompres satu file video pendek.
 *
 * Urutan percobaan (audit pasca-rilis: kompres canvas sering GAGAL di browser
 * HP karena elemen video/canvas tidak dirender bila tidak dipasang ke DOM):
 *  1. Kompres inti: canvas 480p + MediaRecorder 400 kbps — video & kanvas
 *     dipasang ke DOM (tersembunyi di luar layar) agar frame benar-benar
 *     didekode di browser HP.
 *  2. FALLBACK: kompres gagal dengan cara apa pun dan video asli ≤ 8 MB
 *     (batas upload server) → video ASLI diunggah tanpa kompres. Post tetap
 *     tayang; hanya ukurannya yang tidak dioptimalkan.
 *
 * Melempar VideoError berkode:
 * - VIDEO_INVALID   — bukan video/*.
 * - VIDEO_TOO_LARGE — file mentah > 30 MB, atau > 8 MB dan kompres gagal.
 * - VIDEO_DURATION  — durasi metadata > 61 detik.
 */
export async function kompresVideo(file: File): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("Kompres video hanya bisa dilakukan dari browser.");
  }

  // --- 1) Validasi awal (sebelum diproses) ---
  const tipe = file.type || tipeDariNama(file.name);
  if (!tipe.startsWith("video/")) {
    throw videoError("VIDEO_INVALID");
  }
  if (file.size > VIDEO_RAW_MAX_BYTES) {
    throw videoError("VIDEO_TOO_LARGE");
  }

  // --- 2) Coba kompres inti; gagal → fallback video asli bila muat ---
  try {
    return await cobaKompresInti(file, tipe);
  } catch (error) {
    // VIDEO_DURATION harus tetap ditolak (bukan masalah kompresi).
    if (isVideoError(error) && error.code === "VIDEO_DURATION") {
      throw error;
    }
    if (file.size <= VIDEO_UPLOAD_MAKS_BYTES) {
      // Fallback tanpa kompres — post tetap tayang dengan video asli.
      return file;
    }
    throw videoError(
      "VIDEO_TOO_LARGE",
      "Video terlalu besar dan gagal dikompres di perangkat ini. Coba video maksimal 60 detik dengan resolusi lebih rendah, atau gunakan aplikasi kamera dengan resolusi 720p.",
    );
  }
}

/** Kompres inti: canvas 480p + MediaRecorder 400 kbps. */
async function cobaKompresInti(file: File, tipe: string): Promise<File> {
  // --- Dukungan browser ---
  const dukunganCanvas =
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";
  const mimeType = pilihMimeType();
  if (!dukunganCanvas || typeof MediaRecorder === "undefined" || !mimeType) {
    throw videoError(
      "VIDEO_INVALID",
      "Browser tidak mendukung rekaman video.",
    );
  }

  // --- 3) Siapkan elemen video tersembunyi + URL sementara ---
  // WAJIB dipasang ke DOM (tersembunyi di luar layar, bukan display:none):
  // di Chrome Android, video off-DOM tidak mendekode frame → rekaman kosong.
  const urlSumber = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; // tanpa keluaran audio + autoplay tidak diblokir
  video.playsInline = true;
  video.preload = "metadata";
  video.src = urlSumber;
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:480px;opacity:0;pointer-events:none;";
  document.body.append(video);
  let canvas: HTMLCanvasElement | null = null;

  try {
    const durasi = await bacaDurasi(video);
    if (durasi !== null && durasi > VIDEO_DURASI_MAKS_DETIK) {
      throw videoError("VIDEO_DURATION");
    }

    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      const onLoad = () => {
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoad);
        reject(videoError("VIDEO_INVALID", "Video tidak bisa dibaca browser."));
      };
      video.addEventListener("loadedmetadata", onLoad, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.load();
    });

    // --- 4) Kanvas 480p (lebar 480, tinggi proporsional) + perekaman ---
    const lebar = VIDEO_LEBAR_KANVAS;
    const tinggiAsli =
      video.videoHeight > 0
        ? Math.round((video.videoHeight / video.videoWidth) * lebar)
        : Math.round(lebar * (9 / 16));
    const tinggi = Math.max(2, tinggiAsli - (tinggiAsli % 2)); // genap (encoder)

    canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    canvas.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw videoError("VIDEO_INVALID", "Browser tidak mendukung rekaman video.");
    }

    const stream = canvas.captureStream(VIDEO_FPS);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    const potongan: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        potongan.push(event.data);
      }
    };

    // Gambar setiap frame video ke kanvas sampai berhenti. Prioritas
    // requestVideoFrameCallback (sinkron dengan frame dekode), fallback rAF.
    let jalan = true;
    const videoBerframe = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };
    const gambarFrame = () => {
      if (!jalan) return;
      ctx.drawImage(video, 0, 0, lebar, tinggi);
      if (typeof videoBerframe.requestVideoFrameCallback === "function") {
        videoBerframe.requestVideoFrameCallback(gambarFrame);
      } else {
        requestAnimationFrame(gambarFrame);
      }
    };

    // Perekaman selesai: video 'ended', batas 61 detik, atau error.
    const berhenti = new Promise<void>((resolve) => {
      const tutup = () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
        resolve();
      };
      video.addEventListener("ended", tutup, { once: true });
      video.addEventListener("error", tutup, { once: true });
      window.setTimeout(tutup, VIDEO_DURASI_MAKS_DETIK * 1000);
    });

    recorder.start();
    gambarFrame();
    try {
      await video.play();
    } catch {
      jalan = false;
      if (recorder.state !== "inactive") recorder.stop();
      throw videoError(
        "VIDEO_INVALID",
        "Browser tidak mendukung rekaman video.",
      );
    }
    await berhenti;
    jalan = false;
    video.pause();
    stream.getTracks().forEach((track) => track.stop());

    // --- 5) Susun File baru ---
    const hasil = new Blob(potongan, { type: mimeType });
    if (hasil.size === 0) {
      throw videoError(
        "VIDEO_INVALID",
        "Video gagal dikompres di browser ini. Coba video lain.",
      );
    }

    const ekstensi = ekstensiDariMime(mimeType);
    const namaDasar = file.name.replace(/\.[^./\\]+$/, "") || "video";
    return new File([hasil], `${namaDasar}.${ekstensi}`, { type: mimeType });
  } finally {
    // Bersih-bersih wajib: URL sementara + elemen video/canvas dari DOM
    // (PRD 25.6.2 pola).
    URL.revokeObjectURL(urlSumber);
    video.remove();
    canvas?.remove();
  }
}
