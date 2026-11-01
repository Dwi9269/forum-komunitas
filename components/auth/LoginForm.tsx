"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { login } from "@/lib/actions/auth";
import {
  EMAIL_PATTERN,
  PESAN_EMAIL_FORMAT,
  PESAN_EMAIL_KOSONG,
  pesanError,
  type AuthActionResult,
} from "@/components/auth/shared";

const PESAN_PASSWORD_KOSONG = "Password wajib diisi.";

/**
 * Form masuk: email + password (PRD 6, PRD 19).
 * Error dari aksi server ({ code, message }) tampil inline di atas form.
 */
export default function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    // Validasi klien; input dipangkas (trim) sebelum validasi (PRD 20.8).
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
    if (!password) {
      setErrorPassword(PESAN_PASSWORD_KOSONG);
      valid = false;
    } else {
      setErrorPassword(null);
    }
    if (!valid) return;

    data.set("email", email);

    startTransition(async () => {
      const hasil: AuthActionResult = await login(data);
      if (hasil.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      setErrorForm(pesanError(hasil));
    });
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
        autoComplete="current-password"
        placeholder="••••••••"
        error={errorPassword ?? undefined}
        disabled={pending}
        onChange={() => setErrorPassword(null)}
      />

      <div className="flex justify-end">
        <Link
          href="/reset"
          className="text-sm font-medium text-primary hover:underline"
        >
          Lupa password?
        </Link>
      </div>

      <Button type="submit" size="lg" loading={pending}>
        Masuk
      </Button>
    </form>
  );
}
