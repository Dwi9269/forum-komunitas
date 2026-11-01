"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { updatePassword } from "@/lib/actions/auth";
import AuthSuccess from "@/components/auth/AuthSuccess";
import {
  PESAN_PASSWORD_MINIMAL,
  pesanError,
  type AuthActionResult,
} from "@/components/auth/shared";

const PESAN_KONFIRMASI = "Konfirmasi password tidak sama dengan password.";
const PESAN_TAUTAN_BURUK =
  "Tautan ini tidak valid atau sudah kedaluwarsa. Minta tautan baru lewat halaman lupa password.";

/**
 * Form password baru, dibuka dari tautan reset di email (PRD 19).
 *
 * Pertukaran token tautan menjadi sesi ditangani sisi backend (middleware /
 * konvensi @supabase/ssr) SEBELUM halaman ini muncul; komponen ini hanya
 * memanggil aksi `updatePassword` — tidak menyentuh Supabase langsung.
 *
 * Bila tautan sudah kedaluwarsa/invalid, Supabase mengembalikan pengguna
 * dengan parameter `error`/`error_description` di query ATAU di fragment
 * hash (`#error=...`). Keduanya dideteksi lalu tampil pesan + cara minta
 * tautan baru. (Fragment hash tidak terlihat oleh server component, karena
 * itu pemeriksaannya dijalankan sebagai efek di client.)
 */
export default function UpdatePasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [sukses, setSukses] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorTautan, setErrorTautan] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorKonfirmasi, setErrorKonfirmasi] = useState<string | null>(null);

  useEffect(() => {
    // Error di query string, mis. /reset/confirm?error=access_denied&...
    const dariQuery = Boolean(
      params.get("error") || params.get("error_description"),
    );
    if (dariQuery) {
      setErrorTautan(PESAN_TAUTAN_BURUK);
      return;
    }
    // Error di fragment hash, mis. /reset/confirm#error=access_denied&...
    if (typeof window !== "undefined" && window.location.hash.length > 1) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.get("error") || hash.get("error_description")) {
        setErrorTautan(PESAN_TAUTAN_BURUK);
      }
    }
  }, [params]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const konfirmasi = String(data.get("konfirmasi") ?? "");

    setErrorForm(null);
    let valid = true;
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
    if (!valid) return;

    startTransition(async () => {
      const hasil: AuthActionResult = await updatePassword(data);
      if (hasil.ok) {
        setSukses(true);
        return;
      }
      setErrorForm(pesanError(hasil));
    });
  }

  if (sukses) {
    return (
      <AuthSuccess title="Password berhasil diubah">
        <p>
          Passwordmu sudah diperbarui. Sekarang kamu bisa masuk dengan password
          baru.
        </p>
        <div className="mt-4">
          <Button size="sm" onClick={() => router.push("/login")}>
            Masuk
          </Button>
        </div>
      </AuthSuccess>
    );
  }

  if (errorTautan) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 px-6 py-8 text-center"
      >
        <h2 className="text-lg font-semibold text-foreground">
          Tautan tidak berlaku
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {errorTautan}
        </p>
        <div className="mt-2">
          <Button size="sm" onClick={() => router.push("/reset")}>
            Kirim ulang tautan
          </Button>
        </div>
      </div>
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
        Buat password baru untuk akunmu. Pilih yang belum pernah kamu pakai
        sebelumnya.
      </p>

      <Input
        label="Password baru"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Minimal 8 karakter"
        error={errorPassword ?? undefined}
        disabled={pending}
        onChange={() => setErrorPassword(null)}
      />

      <Input
        label="Konfirmasi password baru"
        name="konfirmasi"
        type="password"
        autoComplete="new-password"
        placeholder="Ulangi password baru"
        error={errorKonfirmasi ?? undefined}
        disabled={pending}
        onChange={() => setErrorKonfirmasi(null)}
      />

      <Button type="submit" size="lg" loading={pending}>
        Simpan password baru
      </Button>
    </form>
  );
}
