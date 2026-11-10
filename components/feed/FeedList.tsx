"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import PostCard from "@/components/PostCard";
import { type ViewerRole } from "@/components/PostMenu";
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
  /**
   * Hanya komunitas yang diikuti (PRD 18.2.1) — dikirim ulang pada pagination
   * "Muat lagi" agar halaman berikutnya konsisten dengan halaman pertama.
   */
  onlyJoined?: boolean;
  /** Pencarian aktif (PRD Pasca-MVP 15) — dikirim ulang pada "Muat lagi". */
  search?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Tampilkan badge komunitas pada kartu. */
  showCommunity?: boolean;
  /**
   * Role penampil (dari ambilSesi di halaman server) — diteruskan ke tiap
   * PostCard; moderator/admin mendapat aksi takedown langsung di menu (Fase 6).
   */
  viewerRole?: ViewerRole;
}

export default function FeedList({
  initialItems,
  initialCursor,
  initialError,
  communitySlug,
  username,
  sort = "new",
  onlyJoined,
  search,
  emptyTitle = "Belum ada postingan",
  emptyDescription = "Jadilah yang pertama membagikan sesuatu!",
  showCommunity = true,
  viewerRole = "member",
}: FeedListProps) {
  const [items, setItems] = useState<FeedPostView[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [error, setError] = useState<string | null>(initialError);
  const [memuat, setMemuat] = useState(false);

  // Sinkronkan ulang bila server mengirim data baru (router.refresh() setelah
  // aksi moderasi seperti takedown) — tanpa ini, post yang baru disembunyikan/
  // dihapus moderator tetap tertahan di state klien sampai reload penuh.
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setError(initialError);
  }, [initialItems, initialCursor, initialError]);

  /** Muat halaman berikutnya; cursor null = mulai dari awal (retry). */
  async function muat(dariCursor: string | null) {
    setMemuat(true);
    setError(null);
    try {
      // Argumen lewat variabel (bukan literal) agar properti tambahan `sort`
      // tidak ditolak TypeScript bila tipe param backend belum memilikinya.
      // onlyJoined ikut dikirim ulang (PRD 18.2.1) agar pagination tetap
      // hanya komunitas yang diikuti.
      const args = {
        cursor: dariCursor ?? undefined,
        communitySlug,
        username,
        sort,
        onlyJoined,
        search,
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
          viewerRole={viewerRole}
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
