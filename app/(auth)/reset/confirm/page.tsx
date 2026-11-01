import type { Metadata } from "next";
import { Suspense } from "react";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import UpdatePasswordForm from "@/components/auth/UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Password baru",
  description:
    "Buat password baru untuk akun Forum Komunitasmu lewat tautan reset.",
};

function Fallback() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="flex items-center justify-center py-12"
    >
      <Spinner size="lg" className="text-primary" />
    </div>
  );
}

/**
 * Halaman password baru (PRD 19): dibuka dari tautan reset di email.
 * UpdatePasswordForm memakai useSearchParams untuk mendeteksi tautan
 * kedaluwarsa, sehingga wajib dibungkus Suspense saat prerender statis.
 */
export default function ResetConfirmPage() {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">Password baru</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Atur password barimu untuk akun ini.
      </p>

      <Suspense fallback={<Fallback />}>
        <UpdatePasswordForm />
      </Suspense>
    </Card>
  );
}
