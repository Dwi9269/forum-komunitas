import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Layout rute auth (/(auth)): login, daftar, lupa password, password baru.
 * Kartu dipusatkan di tengah layar (mobile-first, kolom tunggal) dengan
 * logo/nama forum di atasnya dan tautan kembali ke beranda (PRD 6).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Link
              href="/"
              aria-label="Forum Komunitas — kembali ke beranda"
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            >
              {/* Ikon gelembung percakapan (gaya lucide message-circle). */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Forum Komunitas
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tempat bercerita dan berdiskusi sesama anggota.
              </p>
            </div>
          </div>

          {children}

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Kembali ke beranda
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
