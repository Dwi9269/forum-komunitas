import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/actions/auth";
import AdminTabs from "@/components/admin/AdminTabs";

/**
 * Layout dashboard admin — Fase 4 (MOD).
 *
 * Guard server (PRD 18.6): hanya moderator/admin yang boleh masuk. Tamu dan
 * member diarahkan ke "/" (tidak membocorkan keberadaan halaman admin).
 * Data di sini per sesi → dirender dinamis. Aksi per halaman tetap dijaga
 * ulang di lib/actions (pre-cek role) + RLS DB — guard layout hanya UX.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let sesi: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    sesi = await getSessionUser();
  } catch {
    sesi = null;
  }

  if (!sesi || (sesi.role !== "moderator" && sesi.role !== "admin")) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <div className="flex h-8 items-center justify-between gap-3">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              Dashboard Admin
            </h1>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">
                @{sesi.username || "pengguna"}
              </span>
              <Link
                href="/"
                className="rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ← Forum
              </Link>
            </div>
          </div>
          {/* Tab sesuai wireframe PRD 22.4 */}
          <div className="mt-2">
            <AdminTabs />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-16 pt-4 md:pb-10">
        {children}
      </main>
    </div>
  );
}
