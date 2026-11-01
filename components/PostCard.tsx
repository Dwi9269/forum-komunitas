import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { waktuRelatif, type FeedPostView } from "@/components/feed/types";

export interface PostCardProps {
  post: FeedPostView;
  /** Sembunyikan badge komunitas di halaman komunitas itu sendiri. */
  showCommunity?: boolean;
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
 * Anonim), waktu relatif, judul, cuplikan 2 baris, skor + jumlah komentar.
 * Seluruh kartu adalah satu Link ke detail. Teks user dirender sebagai teks
 * biasa (React default) — TANPA dangerouslySetInnerHTML.
 */
export default function PostCard({
  post,
  showCommunity = true,
}: PostCardProps) {
  const penulis = post.authorName ?? "Anonim";

  return (
    <Link
      href={post.href}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
  );
}
