"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav tab dashboard admin (wireframe PRD 22.4: [Laporan] [Pengguna]
 * [Undangan] [Komunitas] [Log]). Client Component agar tab aktif mengikuti
 * path saat ini (usePathname) tanpa dikirim props dari layout.
 */

const TABS = [
  { href: "/admin", label: "Laporan", exact: true },
  { href: "/admin/users", label: "Pengguna", exact: false },
  { href: "/admin/invites", label: "Kode Undangan", exact: false },
  { href: "/admin/communities", label: "Komunitas", exact: false },
  { href: "/admin/log", label: "Log", exact: false },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Menu admin"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        const aktif = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={aktif ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              aktif
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
