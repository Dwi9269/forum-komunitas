"use client";

import { useEffect, useState } from "react";

/**
 * PWA (Fase 6 — Pasca-MVP 15, tanpa push), pola komponen klien ala
 * components/feed/BottomNav.tsx. Dua tugas:
 *
 * 1. Mendaftarkan service worker /sw.js sekali saat mount (kegagalan diam —
 *    forum tetap jalan normal tanpa SW).
 * 2. Menangkap event `beforeinstallprompt` (Chromium) → menampilkan banner
 *    diskrit "Pasang aplikasi Forum" dengan tombol Pasang yang memanggil
 *    deferredPrompt.prompt().
 *
 * Banner TIDAK muncul bila:
 * - browser tidak mendukung service worker,
 * - aplikasi sudah berjalan terpasang (display-mode standalone / iOS standalone),
 * - pengguna pernah menutup banner ATAU sudah meng-install
 *   (flag localStorage "pwa-install-dismissed" = "1").
 *
 * Di server merender null (semua logika di useEffect) — aman untuk SSR.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const FLAG_KEY = "pwa-install-dismissed";

export default function PwaRegister() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Registrasi service worker (dipanggil sekali per muat halaman penuh;
    // browser mengabaikan registrasi ulang untuk SW yang sama).
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Gagal daftar (bukan https / diblokir ekstensi) → tidak fatal.
    });

    // Sudah berjalan sebagai app terpasang? Chrome/Android: display-mode
    // standalone; iOS Safari: navigator.standalone.
    const nav = navigator as Navigator & { standalone?: boolean };
    const sudahTerpasang =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;
    if (sudahTerpasang) return;

    // Pernah ditutup / sudah pernah install → jangan tampilkan lagi.
    let pernahDitutup = false;
    try {
      pernahDitutup = window.localStorage.getItem(FLAG_KEY) === "1";
    } catch {
      // localStorage bisa diblokir (mis. private mode) → anggap belum pernah.
    }
    if (pernahDitutup) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Cegah mini-infobar bawaan; kita tampilkan banner sendiri.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      try {
        window.localStorage.setItem(FLAG_KEY, "1");
      } catch {
        // Abaikan — banner cukup disembunyikan untuk sesi ini.
      }
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const tandaiSelesai = () => {
    try {
      window.localStorage.setItem(FLAG_KEY, "1");
    } catch {
      // Abaikan — cukup sembunyikan banner untuk sesi ini.
    }
    setPromptEvent(null);
  };

  const pasang = async () => {
    const event = promptEvent;
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice; // accepted maupun dismissed → banner tidak perlu lagi
    } catch {
      // prompt bisa gagal (syarat install belum terpenuhi) → tutup banner.
    }
    tandaiSelesai();
  };

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-lg md:bottom-4 md:right-4 md:left-auto md:max-w-sm"
    >
      <span className="flex-1 text-sm text-foreground">
        📱 Pasang aplikasi Forum
      </span>
      <button
        type="button"
        onClick={pasang}
        className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Pasang
      </button>
      <button
        type="button"
        onClick={tandaiSelesai}
        aria-label="Tutup, jangan tampilkan lagi"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
