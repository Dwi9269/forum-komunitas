"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import ImagePicker from "@/components/ImagePicker";
import { updatePassword, requestPasswordReset } from "@/lib/actions/auth";
import { updateProfile } from "@/lib/actions/profiles";
import { uploadAvatar } from "@/lib/image/upload";
import { isFotoError } from "@/lib/image/compress";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Form pengaturan profil (PRD 6, 18.1; Fase 4):
 * - Bio maksimal 200 karakter (penghitung n/200, PRD 21).
 * - Avatar: ImagePicker mode `single` + pratinjau seketika; begitu foto
 *   dipilih, uploadAvatar() jalan seketika (kompres 512 px/512 KB lalu ke
 *   bucket avatars) dan URL publiknya disiapkan untuk updateProfile.
 *   Avatar lama bisa dihapus dari pratinjau → disimpan sebagai kosong.
 * - Simpan → updateProfile({ bio?, avatarUrl? }) → sukses: "Tersimpan" +
 *   router.refresh() (sesi dari getSessionUser ikut terbarui, header pun).
 * - Error tampil inline dengan pesan ramah (PRD 20: BIO_TOO_LONG,
 *   AVATAR_INVALID, dll.).
 */

const BIO_MAKS = 200;
const PESAN_BIO_PANJANG = "Bio maksimal 200 karakter.";

/** Pesan ramah untuk error alur foto/upload (tanpa detail teknis). */
function pesanGagalFoto(error: unknown): string {
  if (isFotoError(error)) return error.message;
  return extractErrorCode(error).message;
}

export interface SettingsFormProps {
  username: string;
  /** Email akun (untuk kirim tautan ganti sandi). */
  email: string;
  initialBio: string;
  initialAvatarUrl: string | null;
}

export default function SettingsForm({
  username,
  email,
  initialBio,
  initialAvatarUrl,
}: SettingsFormProps) {
  const router = useRouter();
  const [bio, setBio] = useState(initialBio);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrlBaru, setAvatarUrlBaru] = useState<string | null>(null);
  const [avatarDihapus, setAvatarDihapus] = useState(false);
  const [mengunggah, setMengunggah] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Ganti sandi: langsung via sesi aktif, atau tautan email (ala OTP).
  const [sandiBaru, setSandiBaru] = useState("");
  const [sandiUlang, setSandiUlang] = useState("");
  const [errorSandi, setErrorSandi] = useState<string | null>(null);
  const [pesanSandi, setPesanSandi] = useState<string | null>(null);
  const [pendingSandi, startTransitionSandi] = useTransition();
  const [pendingTautan, startTransitionTautan] = useTransition();

  const files = avatarFile ? [avatarFile] : [];
  const tersimpan = pesan !== null;

  /** Pilih / hapus avatar dari ImagePicker (single). */
  function gantiAvatar(berikut: File[]) {
    setError(null);
    setPesan(null);
    const file = berikut[0] ?? null;
    setAvatarFile(file);
    if (!file) {
      // Avatar dihapus dari pratinjau.
      setAvatarUrlBaru(null);
      setAvatarDihapus(Boolean(initialAvatarUrl));
      return;
    }
    setAvatarDihapus(false);
    void unggahAvatar(file);
  }

  /** Upload seketika saat foto dipilih; URL publik dipakai saat Simpan. */
  async function unggahAvatar(file: File) {
    setMengunggah(true);
    setError(null);
    setAvatarUrlBaru(null);
    try {
      const url = await uploadAvatar(file);
      setAvatarUrlBaru(url);
    } catch (err) {
      setError(pesanGagalFoto(err));
    } finally {
      setMengunggah(false);
    }
  }

  function simpan() {
    const bioBersih = bio.trim(); // trim sebelum validasi (PRD 20.8)
    setError(null);
    setPesan(null);
    if (bioBersih.length > BIO_MAKS) {
      setError(PESAN_BIO_PANJANG);
      return;
    }

    startTransition(async () => {
      try {
        // Avatar terpilih tetap belum terunggah (upload pertama gagal) →
        // coba sekali lagi sebelum menyimpan.
        let urlAvatar = avatarUrlBaru;
        if (avatarFile && !urlAvatar) {
          setMengunggah(true);
          try {
            urlAvatar = await uploadAvatar(avatarFile);
            setAvatarUrlBaru(urlAvatar);
          } catch (err) {
            setError(pesanGagalFoto(err));
            return;
          } finally {
            setMengunggah(false);
          }
        }

        const input: { bio?: string; avatarUrl?: string } = {
          bio: bioBersih,
        };
        if (urlAvatar) {
          input.avatarUrl = urlAvatar;
        } else if (avatarDihapus) {
          input.avatarUrl = ""; // hapus avatar (tersimpan null)
        }

        const hasil: unknown = await updateProfile(input);
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setError(gagal);
          return;
        }
        setPesan("Tersimpan");
        // Segarkan data server (profil di header ikut terbarui).
        router.refresh();
      } catch (err) {
        setError(extractErrorCode(err).message);
      }
    });
  }

  /** Ubah sandi langsung — sesi aktif (Supabase updateUser, tanpa email). */
  function ubahSandi() {
    setErrorSandi(null);
    setPesanSandi(null);
    if (sandiBaru.length < 8) {
      setErrorSandi("Sandi minimal 8 karakter.");
      return;
    }
    if (sandiBaru !== sandiUlang) {
      setErrorSandi("Konfirmasi sandi tidak sama.");
      return;
    }
    const data = new FormData();
    data.set("password", sandiBaru);
    data.set("confirm_password", sandiUlang);
    startTransitionSandi(async () => {
      try {
        const hasil: unknown = await updatePassword(data);
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setErrorSandi(gagal);
          return;
        }
        setPesanSandi("Sandi berhasil diganti.");
        setSandiBaru("");
        setSandiUlang("");
      } catch (err) {
        setErrorSandi(extractErrorCode(err).message);
      }
    });
  }

  /** Kirim tautan ganti sandi ke email — alur konfirmasi email (ala OTP). */
  function kirimTautanSandi() {
    setErrorSandi(null);
    setPesanSandi(null);
    const data = new FormData();
    data.set("email", email);
    startTransitionTautan(async () => {
      try {
        const hasil: unknown = await requestPasswordReset(data);
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setErrorSandi(gagal);
          return;
        }
        const pesanServer =
          (hasil as { message?: string }).message ??
          "Tautan ganti sandi sudah dikirim.";
        setPesanSandi(
          `${pesanServer} Buka tautannya di email (${email}) untuk membuat sandi baru — cek folder spam juga.`,
        );
      } catch (err) {
        setErrorSandi(extractErrorCode(err).message);
      }
    });
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Profil</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Masuk sebagai <span className="font-medium">{username}</span>
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}
      {tersimpan && !error && (
        <div
          role="status"
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-primary"
        >
          {pesan}
        </div>
      )}

      {/* Avatar (ImagePicker single): pratinjau seketika + upload saat pilih. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Foto profil
        </span>
        <ImagePicker
          files={files}
          onChange={gantiAvatar}
          single
          disabled={mengunggah || pending}
        />
        {mengunggah && (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Mengunggah avatar...
          </p>
        )}
      </div>

      {/* Bio (maks 200) */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="bio"
          className="text-sm font-medium text-foreground"
        >
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setPesan(null);
          }}
          placeholder="Ceritakan sedikit tentang kamu..."
          rows={3}
          maxLength={BIO_MAKS}
          aria-invalid={bio.trim().length > BIO_MAKS ? true : undefined}
          disabled={pending}
          className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span
          className={`self-end text-xs ${
            bio.length > BIO_MAKS ? "text-danger" : "text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          {bio.length}/{BIO_MAKS}
        </span>
      </div>

      <Button
        onClick={simpan}
        size="md"
        loading={pending}
        disabled={mengunggah || pending}
        className="self-end"
      >
        Simpan
      </Button>

      {/* Ganti sandi (PRD 6): langsung lewat sesi aktif, atau tautan email. */}
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Ganti sandi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Minimal 8 karakter. Bila lupa sandi sekarang, pakai jalur tautan
            email di bawah.
          </p>
        </div>

        {errorSandi && (
          <div
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
          >
            {errorSandi}
          </div>
        )}
        {pesanSandi && (
          <div
            role="status"
            className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-primary"
          >
            {pesanSandi}
          </div>
        )}

        <Input
          label="Sandi baru"
          name="sandi-baru"
          type="password"
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
          value={sandiBaru}
          onChange={(e) => {
            setSandiBaru(e.target.value);
            setPesanSandi(null);
          }}
          disabled={pendingSandi || pendingTautan}
        />
        <Input
          label="Ulangi sandi baru"
          name="sandi-baru-ulang"
          type="password"
          autoComplete="new-password"
          placeholder="Ulangi sandi baru"
          value={sandiUlang}
          onChange={(e) => setSandiUlang(e.target.value)}
          disabled={pendingSandi || pendingTautan}
        />
        <Button
          onClick={ubahSandi}
          size="md"
          loading={pendingSandi}
          disabled={pendingSandi || pendingTautan || mengunggah}
          className="self-end"
        >
          Ubah sandi sekarang
        </Button>

        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <span className="h-px flex-1 bg-border" />
          <span>atau</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="secondary"
          onClick={kirimTautanSandi}
          loading={pendingTautan}
          disabled={pendingSandi || pendingTautan}
        >
          Kirim tautan ganti sandi ke email
        </Button>
        <p className="text-xs text-muted-foreground">
          Tautan dikirim ke{" "}
          <span className="font-medium">{email || "email akunmu"}</span> — buka
          tautannya untuk membuat sandi baru, seperti kode OTP lewat email.
        </p>
      </div>
    </Card>
  );
}
