"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Ikon lonceng notifikasi di header (Pasca-MVP 15) — Fase 6 realtime:
 * sebelumnya dirender server oleh app/(main)/layout.tsx dan hanya berubah
 * saat navigasi; sekarang komponen klien yang berlangganan Supabase
 * postgres_changes sehingga badge bertambah/kurang TANPA refresh halaman.
 *
 * Cara kerja:
 * - Layout (server) tetap menghitung angka awal via getUnreadCount() dan
 *   mengirimnya sebagai `initialUnread` — render pertama identik dengan
 *   perilaku lama (SSR), tanpa kedip angka.
 * - useEffect: klien browser (lib/supabase/client) membuka channel
 *   `notifications-<userId>` dan mendengarkan INSERT (notifikasi baru belum
 *   dibaca → +1) serta UPDATE (tandai dibaca → -1) pada tabel notifications
 *   yang difilter user_id miliknya. Realtime postgres_changes menghormati
 *   RLS: Supabase hanya mengirim baris milik pengguna yang sedang login.
 * - Klien TIDAK menjalankan query notifikasi lain (SELECT dsb.) — satu-satunya
 *   sumber perubahan angka adalah event channel + sinkronisasi prop dari
 *   render server (router.refresh()).
 * - Navigasi tidak berubah: ikon tetap <Link href="/notifikasi">; realtime
 *   hanya mengubah angka badge.
 *
 * Tamu (userId null) → render null, sama seperti sebelumnya.
 */

/** Kolom notifications yang dibaca dari payload realtime (snake_case DB). */
interface NotifikasiRealtimeRow {
  is_read: boolean | null;
}

export interface NotificationBellProps {
  /** id pengguna (profiles.id); null = tamu → komponen merender null. */
  userId: string | null;
  /** Angka belum dibaca versi server (getUnreadCount di layout, try/catch). */
  initialUnread: number;
}

/** Ikon lonceng (SVG inline, tanpa dependensi) — dipindah apa adanya dari layout. */
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

export default function NotificationBell({
  userId,
  initialUnread,
}: NotificationBellProps) {
  const [unread, setUnread] = useState(initialUnread);

  // Sinkron dengan render server terbaru — router.refresh() dari halaman
  // /notifikasi ("Tandai semua dibaca") me-render ulang layout sehingga
  // initialUnread baru dikirim sebagai prop; tanpa efek ini angka badge
  // akan basi (pola sinkron initial* sama dengan components/NotificationsList.tsx).
  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  // Langganan realtime postgres_changes (Fase 6). Dibuat ulang bila userId
  // berubah (login/logout = navigasi penuh, tapi tetap dijaga), dan channel
  // di-remove saat unmount agar tidak ada kebocoran langganan antar halaman.
  useEffect(() => {
    if (!userId) {
      return;
    }

    let supabase: SupabaseClient | undefined;
    let channel: RealtimeChannel | undefined;
    try {
      supabase = createClient();
      channel = supabase
        .channel(`notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Notifikasi baru dari trigger DB; hanya tambah bila belum dibaca.
            const baru = payload.new as NotifikasiRealtimeRow | null;
            if (baru && baru.is_read === false) {
              setUnread((n) => n + 1);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // Tandai dibaca (is_read false→true) → kurangi badge; tanpa batas
            // bawah agar tidak bisa negatif bila event terlewat/ganda.
            const baru = payload.new as NotifikasiRealtimeRow | null;
            const lama = payload.old as NotifikasiRealtimeRow | null;
            if (baru?.is_read === true && lama?.is_read === false) {
              setUnread((n) => Math.max(0, n - 1));
            }
            // baru.is_read === false → tidak berubah (masih belum dibaca).
          },
        )
        .subscribe();
    } catch {
      // Env kredensial belum terisi / gagal membuat klien (lib/supabase/client
      // melempar saat env kosong) → tanpa realtime; badge tetap benar dari
      // nilai server dan diperbarui saat navigasi / router.refresh().
      return;
    }

    return () => {
      if (supabase && channel) {
        // removeChannel membatalkan langganan socket; promise diabaikan
        // (void) karena cleanup tidak boleh async.
        void supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  // Tamu: tanpa lonceng (perilaku lama layout).
  if (!userId) {
    return null;
  }

  return (
    <Link
      href="/notifikasi"
      aria-label={
        unread > 0 ? `Notifikasi — ${unread} belum dibaca` : "Notifikasi"
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
  );
}
