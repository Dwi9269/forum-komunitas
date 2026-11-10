import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getUnreadCount } from "@/lib/actions/notifications";
import AccountStatusBanner from "@/components/AccountStatusBanner";
import Avatar from "@/components/ui/Avatar";
import BottomNav from "@/components/feed/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { ambilDaftarKomunitas, ambilSesi } from "@/components/feed/server-data";
import { toCommunityViews } from "@/components/feed/types";

/**
 * Seluruh data layout bersifat per-pengguna (sesi, keanggotaan komunitas),
 * jadi semua rute di grup ini dirender dinamis.
 */
export const dynamic = "force-dynamic";

function IkonBuat() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

/** Ikon lonceng notifikasi (SVG inline, tanpa dependensi). */
function IkonLonceng() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Layout inti forum (route group "(main)"): header (logo teks, nav komunitas
 * ringkas, tombol "+ Buat Post"), banner status akun bila disuspend/banned
 * (PRD 18.1.6-7), dan bottom nav mobile (wireframe PRD 22.1).
 * Sesi diambil via getSessionUser (server) → tamu melihat Masuk/Daftar,
 * pengguna melihat avatar + username + Keluar.
 */
export default async function MainLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [sesiHasil, komunitasHasil] = await Promise.all([
    ambilSesi(),
    ambilDaftarKomunitas(),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  const komunitas = komunitasHasil.ok
    ? toCommunityViews(komunitasHasil.data).slice(0, 8)
    : [];

  const statusAkun =
    sesi &&
    (sesi.status === "suspended" || sesi.status === "banned")
      ? sesi.status
      : null;

  // Badge notifikasi (Pasca-MVP 15): angka belum dibaca HANYA bila sesi ada.
  // Layout force-dynamic → badge terhitung ulang di setiap navigasi. Kegagalan
  // (env/RLS/jaringan) dianggap 0 agar header tidak pernah rusak.
  let unread = 0;
  if (sesi) {
    try {
      const unreadHasil = await getUnreadCount();
      unread = unreadHasil.ok ? unreadHasil.data : 0;
    } catch {
      unread = 0;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Logo teks (PRD 22.1) */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Forum Komunitas — beranda"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              </svg>
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              Forum<span className="hidden sm:inline"> Komunitas</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Ikon lonceng notifikasi (Pasca-MVP 15) — hanya bila sesi ada;
                badge angka belum dibaca dihitung di server tiap navigasi. */}
            {sesi && (
              <Link
                href="/notifikasi"
                aria-label={
                  unread > 0
                    ? `Notifikasi — ${unread} belum dibaca`
                    : "Notifikasi"
                }
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IkonLonceng />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            )}

            {/* Tombol "+ Buat Post" (wireframe 22.1 / PRD 6) */}
            <Link
              href="/submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <IkonBuat />
              <span className="hidden sm:inline">Buat Post</span>
              <span className="sm:hidden">Buat</span>
            </Link>

            {sesi ? (
              <div className="flex items-center gap-2">
                <Avatar
                  name={sesi.username || "?"}
                  src={sesi.avatarUrl}
                  size="sm"
                />
                <span className="hidden max-w-32 truncate text-sm font-medium text-foreground md:inline">
                  {sesi.username || "pengguna"}
                </span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Keluar
                  </button>
                </form>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Masuk
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Daftar
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Nav komunitas ringkas: chip horizontal-scroll (sembunyi bila kosong/gagal). */}
        {komunitas.length > 0 && (
          <nav
            aria-label="Daftar komunitas"
            className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {komunitas.map((k) => (
              <Link
                key={k.slug}
                href={`/c/${encodeURIComponent(k.slug)}`}
                className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                c/{k.slug}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-28 pt-4 md:pb-10">
        {statusAkun && (
          <div className="mb-4">
            <AccountStatusBanner
              status={statusAkun}
              suspendedUntil={sesi?.suspendedUntil ?? null}
            />
          </div>
        )}
        {children}
      </main>

      <BottomNav username={sesi?.username || null} />

      {/* PWA (Fase 6): registrasi service worker + banner install diskrit.
          Fixed-position, tidak menggeser layout; sembunyi sendiri bila SW
          tidak didukung / sudah terpasang / pernah ditutup. */}
      <PwaRegister />

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/legal/rules" className="hover:text-foreground">
            Aturan Komunitas
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground">
            Syarat &amp; Ketentuan
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            Kebijakan Privasi
          </Link>
          <Link href="/notifikasi" className="hover:text-foreground">
            Notifikasi
          </Link>
        </div>
        <p className="mt-2">© {new Date().getFullYear()} Forum Komunitas</p>
      </footer>
    </div>
  );
}
