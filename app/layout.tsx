import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Forum Komunitas",
    template: "%s | Forum Komunitas",
  },
  description:
    "Forum komunitas untuk berdiskusi, berbagi cerita, dan saling membantu sesama anggota.",
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
