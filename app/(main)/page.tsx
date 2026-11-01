import Link from "next/link";
import FeedList from "@/components/feed/FeedList";
import { ambilFeed } from "@/components/feed/server-data";
import { bacaCursor, toFeedPosts } from "@/components/feed/types";

export const metadata = {
  title: "Beranda",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** ?urutan=terbaru|populer → sort RPC get_feed "new"|"hot" (PRD 4.3). */
function bacaUrutan(sp: Record<string, string | string[] | undefined>): "new" | "hot" {
  const nilai = typeof sp.urutan === "string" ? sp.urutan.toLowerCase() : "";
  return nilai === "populer" ? "hot" : "new";
}

const pillClass = (aktif: boolean) =>
  `inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    aktif
      ? "bg-primary text-primary-foreground"
      : "bg-secondary text-secondary-foreground hover:bg-secondary-hover"
  }`;

/**
 * Beranda / Feed gabungan (PRD 6, wireframe PRD 22.1).
 * Halaman pertama diambil di server (SSR); lanjutan lewat tombol "Muat lagi"
 * di FeedList (pagination kursor). Semua daftar punya state loading/kosong/error.
 */
export default async function BerandaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sort = bacaUrutan(sp);

  const hasil = await ambilFeed({ sort });
  const items = hasil.ok ? toFeedPosts(hasil.data) : [];
  const nextCursor = hasil.ok ? bacaCursor(hasil.data) : null;
  const errorAwal = hasil.ok ? null : hasil.message;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab urutan (wireframe 22.1: [Terbaru] [Populer]) */}
      <nav aria-label="Urutan feed" className="flex gap-2">
        <Link
          href="/?urutan=terbaru"
          className={pillClass(sort === "new")}
          aria-current={sort === "new" ? "page" : undefined}
        >
          Terbaru
        </Link>
        <Link
          href="/?urutan=populer"
          className={pillClass(sort === "hot")}
          aria-current={sort === "hot" ? "page" : undefined}
        >
          Populer
        </Link>
      </nav>

      <FeedList
        initialItems={items}
        initialCursor={nextCursor}
        initialError={errorAwal}
        sort={sort}
        emptyTitle="Belum ada postingan"
        emptyDescription="Ikuti komunitas lewat navigasi di atas, lalu postingan dari komunitas yang kamu ikuti akan muncul di sini."
      />
    </div>
  );
}
