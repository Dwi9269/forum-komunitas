"use client";

import { useEffect, useState } from "react";

/**
 * Galeri foto post di halaman detail (PRD 18.7 / 25, Fase 4): maks 4 foto
 * tampil sebagai kisi thumbnail; klik untuk perbesar memakai dialog ringan
 * buatan sendiri (overlay fixed + Escape + klik latar untuk menutup) —
 * TANPA dependensi tambahan. Foto dirender <img> biasa (pola yang sama
 * dengan ui/Avatar — tanpa konfigurasi domain next/image).
 */

export interface PostGalleryProps {
  /** URL publik foto post, urut position (dari PostDetailView.images). */
  images: string[];
  /** Judul post untuk teks alt & label dialog. */
  title?: string;
}

export default function PostGallery({ images, title }: PostGalleryProps) {
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const foto = images.slice(0, 4); // maks 4 foto per post (PRD 18.3.5)

  // Escape menutup dialog; kunci scroll latar saat dialog terbuka.
  useEffect(() => {
    if (terbuka === null) return;
    function tekanEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTerbuka(null);
    }
    document.addEventListener("keydown", tekanEscape);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tekanEscape);
      document.body.style.overflow = lama;
    };
  }, [terbuka]);

  if (foto.length === 0) return null;

  const alt = (indeks: number) =>
    `Foto ${indeks + 1} dari ${foto.length}${title ? ` — ${title}` : ""}`;

  return (
    <>
      <ul
        className={
          foto.length === 1
            ? "grid grid-cols-1"
            : "grid grid-cols-2 gap-2 sm:grid-cols-3"
        }
      >
        {foto.map((url, indeks) => (
          <li key={url} className={foto.length === 1 ? "col-span-1" : ""}>
            <button
              type="button"
              onClick={() => setTerbuka(indeks)}
              aria-label={`Perbesar foto ${indeks + 1}`}
              className="block w-full overflow-hidden rounded-lg border border-border bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={alt(indeks)}
                loading="lazy"
                className={
                  foto.length === 1
                    ? "aspect-[16/9] w-full object-cover"
                    : "aspect-square w-full object-cover transition-opacity hover:opacity-90"
                }
              />
            </button>
          </li>
        ))}
      </ul>

      {terbuka !== null && foto[terbuka] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto diperbesar ${terbuka + 1} dari ${foto.length}`}
          onClick={() => setTerbuka(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setTerbuka(null)}
            aria-label="Tutup foto"
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden="true">×</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto[terbuka]}
            alt={alt(terbuka)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}
