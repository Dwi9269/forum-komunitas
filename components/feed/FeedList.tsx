"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import PostCard from "@/components/PostCard";
import { getFeed } from "@/lib/actions/posts";
import { extractErrorCode } from "@/lib/errors";
import {
  bacaCursor,
  pesanGagalHasil,
  toFeedPosts,
  type FeedPostView,
} from "@/components/feed/types";

/**
 * Daftar feed dengan pagination kursor (wireframe PRD 22.1: muat 20 post per
 * halaman dengan tombol "Muat lagi").
 *
 * - Halaman pertama diambil Server Component (SSR) dan dikirim sebagai
 *   initialItems; "Muat lagi" memanggil server action getFeed dari klien lalu
 *   MENAMBAHKAN hasil ke daftar (tanpa reload).
 * - State wajib (PRD 22.5): loading (spinner), kosong (EmptyState), error
 *   (ErrorState dengan tombol coba lagi).
 */

export interface FeedListProps {
  initialItems: FeedPostView[];
  initialCursor: string | null;
  /** Pesan error bila pengambilan awal di server gagal. */
  initialError: string | null;
  /** Bila diisi → feed komunitas tertentu (getFeed({ communitySlug })). */
  communitySlug?: string;
  /** Bila diisi → feed profil pengguna (getFeed({ username })). */
  username?: string;
  /** Urutan feed (PRD 4.3): new = Terbaru, hot = Populer. */
  sort?: "new" | "hot";
  emptyTitle?: string;
  emptyDescription?: string;
  /** Tampilkan badge komunitas pada kartu. */
  showCommunity?: boolean;
}

export default function FeedList({
  initialItems,
  initialCursor,
  initialError,
  communitySlug,
  username,
  sort = "new",
  emptyTitle = "Belum ada postingan",
  emptyDescription = "Jadilah yang pertama membagikan sesuatu!",
  showCommunity = true,
}: FeedListProps) {
  const [items, setItems] = useState<FeedPostView[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [error, setError] = useState<string | null>(initialError);
  const [memuat, setMemuat] = useState(false);

  /** Muat halaman berikutnya; cursor null = mulai dari awal (retry). */
  async function muat(dariCursor: string | null) {
    setMemuat(true);
    setError(null);
    try {
      // Argumen lewat variabel (bukan literal) agar properti tambahan `sort`
      // tidak ditolak TypeScript bila tipe param backend belum memilikinya.
      const args = {
        cursor: dariCursor ?? undefined,
        communitySlug,
        username,
        sort,
      };
      const hasil: unknown = await getFeed(args);

      const gagal = pesanGagalHasil(hasil);
      if (gagal) {
        setError(gagal);
        return;
      }

      const data = (hasil as { data?: unknown } | null)?.data;
      const baru = toFeedPosts(data);
      setItems((sebelumnya) => (dariCursor ? [...sebelumnya, ...baru] : baru));
      setCursor(bacaCursor(data));
    } catch (err) {
      setError(extractErrorCode(err).message);
    } finally {
      setMemuat(false);
    }
  }

  if (items.length === 0) {
    if (memuat) {
      return (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Spinner label="Memuat postingan" />
        </div>
      );
    }
    if (error) {
      return (
        <ErrorState
          title="Gagal memuat feed"
          message={error}
          onRetry={() => muat(null)}
        />
      );
    }
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((post, indeks) => (
        <PostCard
          key={post.id || `post-${indeks}`}
          post={post}
          showCommunity={showCommunity}
        />
      ))}

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
            Kamu sudah melihat semua postingan.
          </p>
        )
      )}
    </div>
  );
}
