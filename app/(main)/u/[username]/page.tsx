import Link from "next/link";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import FeedList from "@/components/feed/FeedList";
import { ambilFeed, ambilSesi } from "@/components/feed/server-data";
import {
  bacaCursor,
  toFeedPosts,
  waktuRelatif,
  type FeedPostView,
} from "@/components/feed/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params) {
  const { username } = await params;
  let nama = username;
  try {
    nama = decodeURIComponent(username);
  } catch {
    // Nilai tidak valid → pakai apa adanya.
  }
  return { title: `Profil @${nama}` };
}

/** Avatar terbaik yang tersedia: sesi sendiri, atau avatar dari post pertama. */
function cariAvatar(
  items: FeedPostView[],
  username: string,
  avatarSendiri: string | null,
): string | null {
  if (avatarSendiri) return avatarSendiri;
  const milik = items.find(
    (post) => !post.isAnonymous && post.authorName === username,
  );
  return milik?.authorAvatar ?? null;
}

/**
 * Profil pengguna /u/[username] (PRD 6): header profil (avatar, username,
 * bio bila tersedia) + feed postingan pengguna (getFeed({ username }) lewat
 * FeedList mode username — post anonim otomatis tersaring di server).
 *
 * Catatan data (Fase 4): kontrak saat ini belum menyediakan pembacaan profil
 * lain (bio/avatar/tanggal gabung) — bio hanya tampil di profil sendiri
 * (dari sesi), avatar lain diambil dari post pertamanya di feed, dan
 * "tanggal gabung" menunggu backend (lihat handoff FASE4-FRONTEND).
 */
export default async function HalamanProfil({ params }: Params) {
  const { username: mentah } = await params;
  let username = mentah;
  try {
    username = decodeURIComponent(mentah);
  } catch {
    // Nilai tidak valid → pakai apa adanya.
  }

  const [feedHasil, sesiHasil] = await Promise.all([
    ambilFeed({ username }),
    ambilSesi(),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  const profilSendiri = Boolean(sesi && sesi.username === username);

  const items = feedHasil.ok ? toFeedPosts(feedHasil.data) : [];
  const cursor = feedHasil.ok ? bacaCursor(feedHasil.data) : null;
  const error = feedHasil.ok ? null : feedHasil.message;

  const avatar = cariAvatar(
    items,
    username,
    profilSendiri ? (sesi?.avatarUrl ?? null) : null,
  );
  const bio = profilSendiri ? (sesi?.bio ?? null) : null;
  // Waktu post pertama yang terlihat dipakai sebagai penanda aktivitas.
  const waktuPostPertama = items[0]?.createdAt ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header profil (PRD 6: Profil — post dan komentar pengguna) */}
      <Card>
        <div className="flex items-start gap-3">
          <Avatar
            name={username || "?"}
            src={avatar}
            size="lg"
            className="h-14 w-14 text-lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-foreground">
              {username || "pengguna"}
            </h1>
            {profilSendiri && (
              <p className="text-xs text-muted-foreground">Profil kamu</p>
            )}
            {bio && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                {bio}
              </p>
            )}
            {waktuPostPertama && (
              <p className="mt-1 text-xs text-muted-foreground">
                Aktivitas terakhir{" "}
                <time suppressHydrationWarning dateTime={waktuPostPertama}>
                  {waktuRelatif(waktuPostPertama)}
                </time>
              </p>
            )}
          </div>
          {profilSendiri && (
            <Link
              href="/settings"
              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ubah profil
            </Link>
          )}
        </div>
      </Card>

      {/* Feed postingan pengguna (FeedList mode username) */}
      <FeedList
        initialItems={items}
        initialCursor={cursor}
        initialError={error}
        username={username}
        emptyTitle="Belum ada postingan"
        emptyDescription={
          profilSendiri
            ? "Bagikan sesuatu lewat tombol Buat Post."
            : "Pengguna ini belum membagikan sesuatu."
        }
      />
    </div>
  );
}
