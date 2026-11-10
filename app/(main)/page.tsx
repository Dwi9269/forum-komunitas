import Link from "next/link";
import FeedList from "@/components/feed/FeedList";
import JoinButton from "@/components/feed/JoinButton";
import EmptyState from "@/components/ui/EmptyState";
import { ambilDaftarKomunitas, ambilFeed, ambilSesi } from "@/components/feed/server-data";
import {
  bacaCursor,
  toCommunityViews,
  toFeedPosts,
  type CommunityView,
} from "@/components/feed/types";

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

const tombolClass =
  "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Beranda / Feed gabungan (PRD 6, 18.2.1, wireframe PRD 22.1).
 *
 * PRD 18.2.1: feed beranda HANYA menampilkan post dari komunitas yang
 * DIIKUTI (getFeed({ onlyJoined: true })). Bila pengguna belum mengikuti
 * satu pun komunitas, tampil ajakan memilih komunitas (getCommunities
 * menyertakan tombol Gabung). Keputusan produk untuk TAMU (belum login):
 * browsing publik — halaman memanggil feed tanpa onlyJoined; karena DB
 * mencabut akses anon (uji keamanan PRD 26.1 #15), tamu menerima
 * LOGIN_REQUIRED dan diperlihatkan ajakan masuk/daftar, bukan daftar post.
 *
 * Halaman pertama diambil di server (SSR); lanjutan lewat tombol "Muat lagi"
 * di FeedList (pagination kursor, onlyJoined dikirim ulang). Semua daftar
 * punya state loading/kosong/error.
 */
export default async function BerandaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sort = bacaUrutan(sp);
  // Pencarian (PRD Pasca-MVP 15): cari di judul + isi via getFeed({ search }).
  const cari = typeof sp.cari === "string" ? sp.cari.trim().slice(0, 100) : "";

  const sesiHasil = await ambilSesi();
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  const login = sesi !== null;
  // Fase 6: role penampil untuk aksi takedown langsung di menu post
  // (moderator/admin) — tamu/member tanpa aksi moderasi.
  const viewerRole = sesi?.role ?? "member";

  // Pengguna login → hanya komunitas yang diikuti (PRD 18.2.1).
  // Tamu → tanpa onlyJoined (browsing publik; lihat catatan di atas).
  const hasil = await ambilFeed(
    login
      ? { sort, onlyJoined: true, search: cari || undefined }
      : { sort, search: cari || undefined },
  );
  const items = hasil.ok ? toFeedPosts(hasil.data) : [];
  const nextCursor = hasil.ok ? bacaCursor(hasil.data) : null;
  const errorAwal = hasil.ok ? null : hasil.message;
  const loginDiperlukan = !hasil.ok && hasil.code === "LOGIN_REQUIRED";

  // Ajakan gabung komunitas (PRD 18.2.1) hanya perlu saat pengguna login,
  // feed sukses, dan kosong — daftar komunitas dimuat saat itu saja.
  const perluAjakan = login && hasil.ok && items.length === 0;
  const komunitasHasil = perluAjakan ? await ambilDaftarKomunitas() : null;
  const komunitas =
    komunitasHasil && komunitasHasil.ok
      ? toCommunityViews(komunitasHasil.data)
      : [];
  const belumIkutiApaPun = komunitas.length > 0 && !komunitas.some((k) => k.isJoined);

  return (
    <div className="flex flex-col gap-4">
      {/* Kotak pencarian (PRD Pasca-MVP 15) — form GET murni, tanpa JS */}
      {login && (
        <form method="get" action="/" role="search" className="flex gap-2">
          {sort === "hot" && (
            <input type="hidden" name="urutan" value="populer" />
          )}
          <input
            type="search"
            name="cari"
            defaultValue={cari}
            maxLength={100}
            placeholder="Cari post di komunitas yang kamu ikuti..."
            aria-label="Cari post"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center rounded-lg bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cari
          </button>
        </form>
      )}

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

      {/* Status pencarian aktif */}
      {cari && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Hasil pencarian:{" "}
          <span className="font-medium text-foreground">{cari}</span> ·{" "}
          <Link
            href={`/?urutan=${sort === "hot" ? "populer" : "terbaru"}`}
            className="text-primary underline"
          >
            Bersihkan pencarian
          </Link>
        </p>
      )}

      {loginDiperlukan ? (
        // Tamu: DB mencabut akses baca anon → ajakan masuk/daftar.
        <EmptyState
          title="Masuk untuk melihat feed"
          description="Forum ini berbasis undangan. Masuk dengan akunmu, atau daftar memakai kode undangan untuk melihat postingan komunitas."
          action={
            <div className="flex gap-2">
              <Link
                href="/login"
                className={`${tombolClass} bg-primary text-primary-foreground hover:bg-primary-hover`}
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className={`${tombolClass} bg-secondary text-secondary-foreground hover:bg-secondary-hover`}
              >
                Daftar
              </Link>
            </div>
          }
        />
      ) : perluAjakan && belumIkutiApaPun ? (
        // Pengguna login yang belum mengikuti komunitas mana pun (PRD 18.2.1).
        <AjakanKomunitas komunitas={komunitas.slice(0, 6)} />
      ) : (
        <FeedList
          initialItems={items}
          initialCursor={nextCursor}
          initialError={errorAwal}
          sort={sort}
          onlyJoined={login ? true : undefined}
          search={cari || undefined}
          viewerRole={viewerRole}
          emptyTitle={
            login
              ? "Feed-mu masih kosong"
              : "Belum ada postingan"
          }
          emptyDescription={
            login
              ? "Ikuti komunitas lewat navigasi di atas, lalu postingan dari komunitas yang kamu ikuti akan muncul di sini."
              : "Postingan dari komunitas akan tampil di sini."
          }
        />
      )}
    </div>
  );
}

/**
 * Ajakan memilih komunitas (PRD 18.2.1): daftar komunitas dengan tombol
 * Gabung langsung (optimistic, PRD 18.2.2) + tautan ke halaman komunitas.
 */
function AjakanKomunitas({ komunitas }: { komunitas: CommunityView[] }) {
  return (
    <section
      aria-labelledby="ajakan-komunitas"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h2 id="ajakan-komunitas" className="text-base font-semibold text-foreground">
        Ikuti komunitas untuk mengisi feed-mu
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Beranda hanya menampilkan postingan dari komunitas yang kamu ikuti.
        Pilih beberapa komunitas untuk memulai:
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {komunitas.map((k) => (
          <li
            key={k.slug}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
          >
            <Link
              href={`/c/${encodeURIComponent(k.slug)}`}
              className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block truncate text-sm font-medium text-foreground">
                {k.name}
              </span>
              <span className="block text-xs text-muted-foreground">c/{k.slug}</span>
            </Link>
            <JoinButton slug={k.slug} initialJoined={k.isJoined} isLoggedIn={true} />
          </li>
        ))}
      </ul>
    </section>
  );
}
