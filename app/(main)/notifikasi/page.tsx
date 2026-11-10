import { redirect } from "next/navigation";
import NotificationsList from "@/components/NotificationsList";
import { ambilSesi } from "@/components/feed/server-data";
import {
  getNotifications,
  type NotificationItem,
} from "@/lib/actions/notifications";

export const metadata = {
  title: "Notifikasi",
};

/** Data per-pengguna (sesi + notifikasi) — selalu dirender dinamis. */
export const dynamic = "force-dynamic";

/**
 * Halaman notifikasi (Pasca-MVP 15). Tamu diarahkan ke /login; halaman pertama
 * diambil di server (SSR) dan diteruskan ke NotificationsList (client) untuk
 * aksi tandai-dibaca, tandai-semua, dan pagination "Muat lagi".
 * Layout (main) sudah force-dynamic — badge lonceng di header ikut terbaru.
 */
export default async function NotifikasiPage() {
  const sesiHasil = await ambilSesi();
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  if (!sesi) {
    redirect("/login");
  }

  let items: NotificationItem[] = [];
  let nextCursor: string | null = null;
  let unread = 0;
  let error: string | null = null;
  try {
    const hasil = await getNotifications();
    if (hasil.ok) {
      items = hasil.data.items;
      nextCursor = hasil.data.nextCursor;
      unread = hasil.data.unreadCount;
    } else {
      error = hasil.message;
    }
  } catch {
    // createClient melempar bila env belum diisi — halaman tetap render.
    error = "Gagal memuat notifikasi. Coba lagi.";
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">Notifikasi</h1>
      <NotificationsList
        initialItems={items}
        initialCursor={nextCursor}
        initialUnread={unread}
        initialError={error}
      />
    </div>
  );
}
