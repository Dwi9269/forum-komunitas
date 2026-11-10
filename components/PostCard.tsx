import Link from "next/link";
import Badge from "@/components/ui/Badge";
import PostMenu, { type ViewerRole } from "@/components/PostMenu";
import { waktuRelatif, type FeedPostView } from "@/components/feed/types";

export interface PostCardProps {
  post: FeedPostView;
  /** Sembunyikan badge komunitas di halaman komunitas itu sendiri. */
  showCommunity?: boolean;
  /**
   * Role penampil (dari ambilSesi di halaman server) — moderator/admin
   * mendapat aksi takedown langsung di menu titik tiga (Fase 6).
   */
  viewerRole?: ViewerRole;
}

function IkonPanahAtas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

function IkonKomentar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * Kartu post untuk feed (wireframe PRD 22.1): komunitas, penulis (atau
 * Anonim), waktu relatif, judul, cuplikan 2 baris, thumbnail foto pertama
 * (Fase 4, bila post punya foto), skor + jumlah komentar, dan menu titik
 * tiga (Lapor / Hapus bila milik sendiri; + Sembunyikan & Hapus moderasi
 * bila viewerRole moderator/admin — Fase 6).
 * Seluruh kartu adalah satu Link ke detail — klik pada menu tidak ikut
 * membuka tautan (PostMenu memanggil preventDefault + stopPropagation).
 * Teks user dirender sebagai teks biasa (React default) — TANPA
 * dangerouslySetInnerHTML.
 */
export default function PostCard({
  post,
  showCommunity = true,
  viewerRole = "member",
}: PostCardProps) {
  const penulis = post.authorName ?? "Anonim";
  const fotoPertama = post.images?.[0];

  return (
    <div className="relative rounded-xl border border-border bg-card shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-ring/50">
      <Link
        href={post.href}
        aria-label={post.title}
        className="block rounded-xl p-4 focus-visible:outline-none"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8 text-xs text-muted-foreground">
          {showCommunity && post.communitySlug && (
            <Badge variant="primary">c/{post.communitySlug}</Badge>
          )}
          <span>{penulis}</span>
          <span aria-hidden="true">•</span>
          <time
            suppressHydrationWarning
            dateTime={post.createdAt ?? undefined}
          >
            {waktuRelatif(post.createdAt)}
          </time>
          {post.editedAt && <span className="italic">(diedit)</span>}
        </div>

        <h2 className="mt-2 text-base font-semibold leading-snug text-foreground">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}

        {/* Thumbnail foto pertama (PRD 18.7, Fase 4) — sisanya di detail. */}
        {fotoPertama && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoPertama}
            alt=""
            loading="lazy"
            className="mt-2 aspect-[16/9] w-full rounded-lg border border-border object-cover"
          />
        )}

        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <IkonPanahAtas />
            {post.score}
            <span className="sr-only">skor</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <IkonKomentar />
            {post.commentCount} komentar
          </span>
        </div>
      </Link>

      {/* Menu titik tiga di pojok kanan atas kartu (wireframe 22.1). */}
      <div className="absolute right-2 top-2">
        <PostMenu
          targetType="post"
          targetId={post.id}
          isMine={post.isMine}
          viewerRole={viewerRole}
        />
      </div>
    </div>
  );
}
