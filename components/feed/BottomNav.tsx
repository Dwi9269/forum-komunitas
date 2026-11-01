"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Bottom navigasi mobile (wireframe PRD 22.1: [Beranda] [Komunitas] [+] [Profil]).
 *
 * Item "Komunitas" dari wireframe ditampung oleh baris chip komunitas di
 * header (halaman indeks komunitas tidak ada di PRD 6), sehingga nav bawah
 * memuat: Beranda, Buat Post (+), Profil (atau Masuk untuk tamu).
 * Rute /u/[username] baru dibangun di fase berikutnya.
 */

function Ikon({ jalur, children }: { jalur: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={jalur}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function BottomNav({ username }: { username: string | null }) {
  const pathname = usePathname();
  const profilHref = username ? `/u/${encodeURIComponent(username)}` : "/login";

  const itemClass = (aktif: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
      aktif ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card md:hidden"
    >
      <div className="mx-auto flex w-full max-w-5xl pb-[env(safe-area-inset-bottom)]">
        <Link href="/" className={itemClass(pathname === "/")}>
          <Ikon jalur="h-5 w-5">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </Ikon>
          Beranda
        </Link>
        <Link
          href="/submit"
          className={itemClass(pathname === "/submit")}
          aria-label="Buat post"
        >
          <Ikon jalur="h-5 w-5">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </Ikon>
          Buat
        </Link>
        <Link href={profilHref} className={itemClass(pathname.startsWith("/u/"))}>
          <Ikon jalur="h-5 w-5">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </Ikon>
          {username ? "Profil" : "Masuk"}
        </Link>
      </div>
    </nav>
  );
}
