import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/ui/ErrorState";
import VoteButtons from "@/components/VoteButtons";
import CommentTree from "@/components/CommentTree";
import CommentForm from "@/components/CommentForm";
import PostMenu from "@/components/PostMenu";
import PostGallery from "@/components/PostGallery";
import { ambilPost, ambilSesi } from "@/components/feed/server-data";
import { toPostDetail, waktuRelatif } from "@/components/feed/types";

export const metadata = {
  title: "Detail post",
};

/**
 * Detail post /p/[id] (PRD 6, wireframe PRD 22.2): judul, penulis + waktu
 * relatif + label (diedit), isi lengkap (teks biasa), galeri foto (maks 4,
 * klik untuk perbesar — Fase 4), vote (optimistic), menu titik tiga
 * (Lapor / Hapus bila milik sendiri), form komentar, dan komentar
 * bertingkat dengan vote + menu masing-masing.
 */
export default async function DetailPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [hasil, sesiHasil] = await Promise.all([ambilPost(id), ambilSesi()]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;

  const kembali = (
    <Link
      href="/"
      className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      ← Kembali
    </Link>
  );

  if (!hasil.ok) {
    // Termasuk POST_UNAVAILABLE: post dihapus/disembunyikan (PRD 18.4.4).
    return (
      <div className="flex flex-col gap-4">
        {kembali}
        <ErrorState
          title="Post tidak bisa ditampilkan"
          message={hasil.message}
        />
      </div>
    );
  }

  const { post, comments } = toPostDetail(hasil.data);
  if (!post) {
    return (
      <div className="flex flex-col gap-4">
        {kembali}
        <ErrorState
          title="Post tidak ditemukan"
          message="Post ini mungkin sudah dihapus atau tautannya salah."
        />
      </div>
    );
  }

  const sudahMasuk = Boolean(sesi);
  // Akun disuspend tidak bisa vote/komentar (PRD 18.1.6, 18.5.4).
  const dinonaktifkan = sesi?.status === "suspended";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {kembali}
        <div className="flex items-center gap-2">
          {post.communitySlug && (
            <Link
              href={`/c/${encodeURIComponent(post.communitySlug)}`}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Badge variant="primary">c/{post.communitySlug}</Badge>
            </Link>
          )}
          {/* Menu titik tiga: Lapor untuk semua, Hapus bila milik sendiri
              (PRD 4.6 / 18.3.8). */}
          <PostMenu
            targetType="post"
            targetId={post.id}
            isMine={post.isMine}
          />
        </div>
      </div>

      {/* Isi post (wireframe 22.2) */}
      <Card>
        <h1 className="text-xl font-bold leading-snug text-foreground">
          {post.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{post.authorName ?? "Anonim"}</span>
          <span aria-hidden="true">•</span>
          <time suppressHydrationWarning dateTime={post.createdAt ?? undefined}>
            {waktuRelatif(post.createdAt)}
          </time>
          {post.editedAt && (
            // Label (diedit) — PRD 4.3 / 18.3.7.
            <span className="italic">(diedit)</span>
          )}
        </div>
        {post.content && (
          <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
            {post.content}
          </p>
        )}
        {/* Galeri foto post (maks 4 — PRD 18.3.5); klik untuk perbesar. */}
        {post.images.length > 0 && (
          <div className="mt-3">
            <PostGallery images={post.images} title={post.title} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <VoteButtons
            postId={post.id}
            initialScore={post.score}
            initialMyVote={post.myVote}
            isLoggedIn={sudahMasuk}
            disabled={dinonaktifkan}
          />
          {dinonaktifkan && (
            <span className="text-xs text-muted-foreground">
              Akunmu sedang disuspend — vote dan komentar dinonaktifkan.
            </span>
          )}
        </div>
      </Card>

      {/* Komentar (wireframe 22.2) */}
      <section aria-labelledby="judul-komentar" className="flex flex-col gap-3">
        <h2
          id="judul-komentar"
          className="text-base font-semibold text-foreground"
        >
          Komentar ({post.commentCount})
        </h2>

        {sudahMasuk ? (
          <Card>
            <CommentForm postId={post.id} placeholder="Tulis komentar..." />
          </Card>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Masuk
            </Link>{" "}
            untuk ikut berkomentar.
          </p>
        )}

        <CommentTree
          postId={post.id}
          comments={comments}
          isLoggedIn={sudahMasuk}
          dinonaktifkan={dinonaktifkan}
        />
      </section>
    </div>
  );
}
