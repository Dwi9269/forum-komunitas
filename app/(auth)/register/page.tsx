import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/ui/Card";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Daftar",
  description:
    "Buat akun baru di Forum Komunitas dengan kode undangan yang valid.",
};

/** Halaman daftar (PRD 6, PRD 19): username, email, password, kode undangan. */
export default function RegisterPage() {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Daftar</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Buat akun baru dengan kode undangan.
      </p>

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Masuk
        </Link>
      </p>
    </Card>
  );
}
