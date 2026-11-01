import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/ui/Card";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke akun Forum Komunitasmu dengan email dan password.",
};

/** Halaman masuk (PRD 6, PRD 19): email + password, lupa password, daftar. */
export default function LoginPage() {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Masuk</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Selamat datang kembali! Masuk untuk melanjutkan.
      </p>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-medium text-primary hover:underline"
        >
          Daftar
        </Link>
      </p>
    </Card>
  );
}
