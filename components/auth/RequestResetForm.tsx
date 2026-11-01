"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { requestPasswordReset } from "@/lib/actions/auth";
import AuthSuccess from "@/components/auth/AuthSuccess";
import {
  EMAIL_PATTERN,
  PESAN_EMAIL_FORMAT,
  PESAN_EMAIL_KOSONG,
  pesanError,
  type AuthActionResult,
} from "@/components/auth/shared";

/**
 * Form lupa password (PRD 19): input email → kirim tautan reset.
 * Layar sukses memakai pesan NETRAL — tidak membocorkan apakah email terdaftar.
 */
export default function RequestResetForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sukses, setSukses] = useState(false);
  const [emailDikirim, setEmailDikirim] = useState("");
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();

    setErrorForm(null);
    let valid = true;
    if (!email) {
      setErrorEmail(PESAN_EMAIL_KOSONG);
      valid = false;
    } else if (!EMAIL_PATTERN.test(email)) {
      setErrorEmail(PESAN_EMAIL_FORMAT);
      valid = false;
    } else {
      setErrorEmail(null);
    }
    if (!valid) return;

    data.set("email", email);

    startTransition(async () => {
      const hasil: AuthActionResult = await requestPasswordReset(data);
      if (hasil.ok) {
        setEmailDikirim(email);
        setSukses(true);
        return;
      }
      setErrorForm(pesanError(hasil));
    });
  }

  if (sukses) {
    return (
      <AuthSuccess title="Tautan reset sudah dikirim">
        <p>
          Kalau <strong className="text-foreground">{emailDikirim}</strong>{" "}
          terdaftar, kami sudah mengirim tautan untuk membuat password baru.
        </p>
        <p className="mt-2">Cek juga folder spam atau promosi.</p>
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

      <p className="text-sm text-muted-foreground">
        Masukkan email yang terdaftar. Kami akan mengirim tautan untuk membuat
        password baru.
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

      <Button type="submit" size="lg" loading={pending}>
        Kirim tautan reset
      </Button>
    </form>
  );
}
