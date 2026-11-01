import Link from "next/link";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import FeedList from "@/components/feed/FeedList";
import JoinButton from "@/components/feed/JoinButton";
import {
  ambilFeed,
  ambilKomunitas,
  ambilSesi,
} from "@/components/feed/server-data";
import { bacaCursor, toCommunity, toFeedPosts } from "@/components/feed/types";

export const metadata = {
  title: "Komunitas",
};

/**
 * Halaman komunitas /c/[slug] (PRD 6, 18.2.3): nama, deskripsi, jumlah
 * anggota, tombol Gabung/Keluar (optimistic, tanpa reload), dan feed
 * komunitas itu (getFeed dengan communitySlug).
 */
export default async function HalamanKomunitas({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [hasil, sesiHasil, feedHasil] = await Promise.all([
    ambilKomunitas(slug),
    ambilSesi(),
    ambilFeed({ communitySlug: slug }),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;

  const kembali = (
    <Link
      href="/"
      className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      ← Kembali ke beranda
    </Link>
  );

  if (!hasil.ok) {
    return (
      <div className="flex flex-col gap-4">
        {kembali}
        <ErrorState
          title="Komunitas tidak bisa dimuat"
          message={hasil.message}
        />
      </div>
    );
  }

  const komunitas = toCommunity(hasil.data, slug);
  if (!komunitas) {
    return (
      <div className="flex flex-col gap-4">
        {kembali}
        <ErrorState
          title="Komunitas tidak ditemukan"
          message={`Komunitas "${slug}" tidak ada atau sudah dihapus.`}
        />
      </div>
    );
  }

  const items = feedHasil.ok ? toFeedPosts(feedHasil.data) : [];
  const nextCursor = feedHasil.ok ? bacaCursor(feedHasil.data) : null;
  const errorFeed = feedHasil.ok ? null : feedHasil.message;

  return (
    <div className="flex flex-col gap-4">
      {kembali}

      {/* Info komunitas (PRD 18.2.3) */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-snug text-foreground">
              {komunitas.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              c/{komunitas.slug}
              {komunitas.memberCount !== null && (
                <>
                  {" • "}
                  {komunitas.memberCount.toLocaleString("id-ID")} anggota
                </>
              )}
            </p>
          </div>
          <JoinButton
            slug={komunitas.slug}
            initialJoined={komunitas.isJoined}
            isLoggedIn={Boolean(sesi)}
          />
        </div>
        {komunitas.description && (
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {komunitas.description}
          </p>
        )}
      </Card>

      <FeedList
        initialItems={items}
        initialCursor={nextCursor}
        initialError={errorFeed}
        communitySlug={komunitas.slug}
        showCommunity={false}
        emptyTitle="Belum ada postingan di sini"
        emptyDescription="Jadilah yang pertama memposting di komunitas ini lewat tombol Buat Post!"
      />
    </div>
  );
}
