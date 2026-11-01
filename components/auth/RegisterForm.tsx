"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { register } from "@/lib/actions/auth";
import AuthSuccess from "@/components/auth/AuthSuccess";
import {
  EMAIL_PATTERN,
  PESAN_EMAIL_FORMAT,
  PESAN_EMAIL_KOSONG,
  PESAN_PASSWORD_MINIMAL,
  PESAN_USERNAME,
  USERNAME_PATTERN,
  pesanError,
  type AuthActionResult,
} from "@/components/auth/shared";

const PESAN_KONFIRMASI = "Konfirmasi password tidak sama dengan password.";
const PESAN_UNDANGAN_WAJIB = "Kode undangan wajib diisi.";

// PRD 4.1: "Daftar hanya dengan kode undangan yang valid (bisa dimatikan
// lewat pengaturan)." Default MVP: WAJIB. Ubah ke false bila backend sudah
// mengekspos pengaturan pendaftaran bebas.
const KODE_UNDANGAN_WAJIB = true;

/**
 * Form daftar: username, email, password, konfirmasi password, kode undangan.
 * Validasi klien sesuai PRD 21 dijalankan sebelum aksi server dipanggil.
 * Sukses → layar "Cek email kamu untuk verifikasi" (PRD 19).
 */
export default function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sukses, setSukses] = useState(false);
  const [perluVerifikasi, setPerluVerifikasi] = useState(true);
  const [emailTerdaftar, setEmailTerdaftar] = useState("");
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorUsername, setErrorUsername] = useState<string | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorKonfirmasi, setErrorKonfirmasi] = useState<string | null>(null);
  const [errorUndangan, setErrorUndangan] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const konfirmasi = String(data.get("konfirmasi") ?? "");
    const undangan = String(data.get("undangan") ?? "").trim();

    // Validasi klien (PRD 21); input dipangkas (trim) sebelum validasi (PRD 20.8).
    setErrorForm(null);
    let valid = true;

    if (!username) {
      setErrorUsername(PESAN_USERNAME);
      valid = false;
    } else if (!USERNAME_PATTERN.test(username)) {
      setErrorUsername(PESAN_USERNAME);
      valid = false;
    } else {
      setErrorUsername(null);
    }

    if (!email) {
      setErrorEmail(PESAN_EMAIL_KOSONG);
      valid = false;
    } else if (!EMAIL_PATTERN.test(email)) {
      setErrorEmail(PESAN_EMAIL_FORMAT);
      valid = false;
    } else {
      setErrorEmail(null);
    }

    if (password.length < 8) {
      setErrorPassword(PESAN_PASSWORD_MINIMAL);
      valid = false;
    } else {
      setErrorPassword(null);
    }

    if (konfirmasi !== password || !konfirmasi) {
      setErrorKonfirmasi(PESAN_KONFIRMASI);
      valid = false;
    } else {
      setErrorKonfirmasi(null);
    }

    if (KODE_UNDANGAN_WAJIB && !undangan) {
      setErrorUndangan(PESAN_UNDANGAN_WAJIB);
      valid = false;
    } else {
      setErrorUndangan(null);
    }

    if (!valid) return;

    // Kirim nilai yang sudah di-trim.
    data.set("username", username);
    data.set("email", email);
    data.set("undangan", undangan);

    startTransition(async () => {
      const hasil: AuthActionResult = await register(data);
      if (hasil.ok) {
        setEmailTerdaftar(email);
        setPerluVerifikasi(hasil.needsEmailConfirmation !== false);
        setSukses(true);
        return;
      }
      setErrorForm(pesanError(hasil));
    });
  }

  if (sukses) {
    return perluVerifikasi ? (
      <AuthSuccess title="Cek email kamu untuk verifikasi">
        <p>
          Kami mengirim tautan verifikasi ke{" "}
          <strong className="text-foreground">{emailTerdaftar}</strong>. Buka
          tautan itu untuk mengaktifkan akunmu sebelum masuk.
        </p>
        <p className="mt-2">
          Tidak menemukan emailnya? Cek juga folder spam atau promosi.
        </p>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/login")}
          >
            Kembali ke halaman masuk
          </Button>
        </div>
      </AuthSuccess>
    ) : (
      <AuthSuccess title="Akun berhasil dibuat">
        <p>Akunmu sudah aktif. Selamat bergabung di Forum Komunitas!</p>
        <div className="mt-4">
          <Button size="sm" onClick={() => router.replace("/")}>
            Mulai jelajah
          </Button>
        </div>
      </AuthSuccess>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {errorForm && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {errorForm}
        </div>
      )}

      <Input
        label="Username"
        name="username"
        type="text"
        autoComplete="username"
        placeholder="mis. budi_kernus"
        error={errorUsername ?? undefined}
        disabled={pending}
        onChange={() => setErrorUsername(null)}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        3–20 karakter: huruf, angka, atau garis bawah. Username tidak bisa
        diganti nanti.
      </p>

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nama@email.com"
        error={errorEmail ?? undefined}
        disabled={pending}
        onChange={() => setErrorEmail(null)}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Minimal 8 karakter"
        error={errorPassword ?? undefined}
        disabled={pending}
        onChange={() => setErrorPassword(null)}
      />

      <Input
        label="Konfirmasi password"
        name="konfirmasi"
        type="password"
        autoComplete="new-password"
        placeholder="Ulangi password"
        error={errorKonfirmasi ?? undefined}
        disabled={pending}
        onChange={() => setErrorKonfirmasi(null)}
      />

      <Input
        label={`Kode undangan${KODE_UNDANGAN_WAJIB ? "" : " (opsional)"}`}
        name="undangan"
        type="text"
        autoComplete="off"
        placeholder="Mis. FORUM2026"
        error={errorUndangan ?? undefined}
        disabled={pending}
        onChange={() => setErrorUndangan(null)}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        Kode undangan wajib untuk akun kedua dan seterusnya (akun pertama
        bebas). Minta kodenya ke admin forum — dibuat lewat menu Kode Undangan
        di dashboard admin.
      </p>

      <Button type="submit" size="lg" loading={pending}>
        Daftar
      </Button>
    </form>
  );
}
