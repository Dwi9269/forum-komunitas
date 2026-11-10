import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Forum Komunitas",
    template: "%s | Forum Komunitas",
  },
  description:
    "Forum komunitas untuk berdiskusi, berbagi cerita, dan saling membantu sesama anggota.",
  // PWA (Fase 6 — Pasca-MVP 15): manifest + ikon SVG + mode web-app iOS.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Forum",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

// Next 15: themeColor (dan konfigurasi viewport) diekspor lewat `viewport`,
// BUKAN lewat metadata. Warna gelap netral, senada manifest & tema aplikasi.
export const viewport: Viewport = {
  themeColor: "#0b0f1a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {/* Container utama: mobile-first, satu kolom; lebar maksimum agar
            nyaman di layar lebar (Fase 2-3 akan menambah sidebar). */}
        <div className="mx-auto w-full max-w-5xl px-4">{children}</div>
      </body>
    </html>
  );
}
