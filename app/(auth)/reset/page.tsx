import type { Metadata } from "next";
import Link from "next/link";
import Card from "@/components/ui/Card";
import RequestResetForm from "@/components/auth/RequestResetForm";

export const metadata: Metadata = {
  title: "Lupa password",
  description:
    "Minta tautan untuk mengatur ulang password akun Forum Komunitasmu.",
};

/** Halaman lupa password (PRD 19): input email → kirim tautan reset. */
export default function ResetPage() {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Lupa password?</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Tenang, semua orang pernah lupa.
      </p>

      <RequestResetForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Sudah ingat passwordnya?{" "}
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
