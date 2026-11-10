"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/actions/notifications";
import { extractErrorCode } from "@/lib/errors";
import { waktuRelatif } from "@/components/feed/types";

/**
 * Daftar notifikasi (Pasca-MVP 15) — pola FeedList:
 * - Halaman pertama diambil Server Component (SSR) → initialItems; "Muat lagi"
 *   memanggil getNotifications({ cursor }) lalu MENAMBAHKAN hasil ke daftar.
 * - Klik item: tandai dibaca (markNotificationRead) lalu navigasi ke
 *   /p/<post_id> HANYA bila post tujuan masih ada (postTersedia dari
 *   posts_feed); konten sudah dihapus/disembunyikan → cukup tandai dibaca.
 * - "Tandai semua dibaca" → markAllNotificationsRead + router.refresh()
 *   agar badge lonceng di header (server) ikut terbaru.
 * - State wajib (PRD 22.5): loading (spinner), kosong (EmptyState), error
 *   inline (role=alert).
 */

export interface NotificationsListProps {
  initialItems: NotificationItem[];
  initialCursor: string | null;
  /** Jumlah belum dibaca versi server (badge lokal; header dari layout). */
  initialUnread: number;
  /** Pesan error bila pengambilan awal di server gagal. */
  initialError: string | null;
}

/** Teks tampilan bila kolom pesan dari DB kosong (komentar/balasan/vote). */
function teksNotifikasi(item: NotificationItem): string {
  if (item.pesan) {
    return item.pesan;
  }
  const siapa = item.actorUsername ?? "Seseorang";
  switch (item.tipe) {
    case "komentar":
      return `${siapa} mengomentari postmu`;
    case "balasan":
      return `${siapa} membalas komentar`;
    case "vote_post":
      return `${siapa} memberi upvote pada postmu`;
    case "vote_comment":
      return `${siapa} memberi upvote pada komentarmu`;
    case "status_akun":
      return "Status akunmu berubah";
    default:
      return `${siapa} berinteraksi denganmu`;
  }
}

export default function NotificationsList({
  initialItems,
  initialCursor,
  initialUnread,
  initialError,
}: NotificationsListProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState<string | null>(initialError);
  const [memuat, setMemuat] = useState(false);
  const [prosesId, setProsesId] = useState<string | null>(null);
  const [prosesSemua, setProsesSemua] = useState(false);

  // Sinkronkan ulang bila server mengirim data baru (router.refresh()).
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setUnread(initialUnread);
    setError(initialError);
  }, [initialItems, initialCursor, initialUnread, initialError]);

  /** Muat halaman berikutnya (cursor null = muat ulang dari awal). */
  async function muat(dariCursor: string | null) {
    setMemuat(true);
    setError(null);
    try {
      const hasil = await getNotifications({
        cursor: dariCursor ?? undefined,
      });
      if (!hasil.ok) {
        setError(hasil.message);
        return;
      }
      setItems((sebelumnya) =>
        dariCursor ? [...sebelumnya, ...hasil.data.items] : hasil.data.items,
      );
      setCursor(hasil.data.nextCursor);
      setUnread(hasil.data.unreadCount);
    } catch (e) {
      setError(extractErrorCode(e).message);
    } finally {
      setMemuat(false);
    }
  }

  /** Klik item: tandai dibaca dulu, lalu navigasi bila post masih ada. */
  async function klikItem(item: NotificationItem) {
    if (prosesId) {
      return;
    }
    setProsesId(item.id);
    setError(null);
    try {
      if (!item.isRead) {
        const hasil = await markNotificationRead(item.id);
        if (!hasil.ok) {
          setError(hasil.message);
          return;
        }
        setItems((sebelumnya) =>
          sebelumnya.map((n) =>
            n.id === item.id ? { ...n, isRead: true } : n,
          ),
        );
        setUnread((n) => Math.max(0, n - 1));
      }
      if (item.postId && item.postTersedia) {
        router.push(`/p/${item.postId}`);
      } else if (!item.isRead) {
        // Tanpa navigasi (post tujuan sudah hilang) → refresh agar badge
        // lonceng di header (dirender server) ikut berkurang.
        router.refresh();
      }
    } catch (e) {
      setError(extractErrorCode(e).message);
    } finally {
      setProsesId(null);
    }
  }

  async function tandaiSemua() {
    setProsesSemua(true);
    setError(null);
    try {
      const hasil = await markAllNotificationsRead();
      if (!hasil.ok) {
        setError(hasil.message);
        return;
      }
      setItems((sebelumnya) =>
        sebelumnya.map((n) => ({ ...n, isRead: true })),
      );
      setUnread(0);
      // Badge lonceng di header dirender server → refresh agar ikut terbaru.
      router.refresh();
    } catch (e) {
      setError(extractErrorCode(e).message);
    } finally {
      setProsesSemua(false);
    }
  }

  if (items.length === 0 && memuat) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Spinner label="Memuat notifikasi" />
      </div>
    );
  }

  if (items.length === 0) {
    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={() => muat(null)}>
            Coba lagi
          </Button>
        </div>
      );
    }
    return (
      <EmptyState
        title="Belum ada notifikasi"
        description="Notifikasi komentar, balasan, upvote, dan status akun akan muncul di sini."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {unread > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={tandaiSemua}
          loading={prosesSemua}
          disabled={prosesSemua || prosesId !== null}
        >
          Tandai semua dibaca
        </Button>
      )}

      {items.map((item, indeks) => {
        const proses = prosesId === item.id;
        return (
          <button
            key={item.id || `notif-${indeks}`}
            type="button"
            onClick={() => klikItem(item)}
            disabled={prosesId !== null || prosesSemua}
            aria-current={proses || undefined}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${
              item.isRead
                ? "border-border bg-card hover:border-ring/50"
                : "border-primary/30 bg-primary/5 hover:border-ring/50"
            }`}
          >
            <Avatar
              name={item.actorUsername || "Sistem"}
              size="sm"
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm text-foreground">
                {teksNotifikasi(item)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {waktuRelatif(item.createdAt)}
              </span>
            </span>
            {!item.isRead && (
              <span
                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}

      {cursor ? (
        <Button
          variant="secondary"
          className="self-center"
          onClick={() => muat(cursor)}
          loading={memuat}
          disabled={memuat}
        >
          Muat lagi
        </Button>
      ) : (
        !memuat &&
        items.length > 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Kamu sudah melihat semua notifikasi.
          </p>
        )
      )}
    </div>
  );
}
