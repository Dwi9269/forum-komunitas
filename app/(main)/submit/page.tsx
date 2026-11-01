import { redirect } from "next/navigation";
import SubmitPostForm from "@/components/SubmitPostForm";
import { ambilDaftarKomunitas, ambilSesi } from "@/components/feed/server-data";
import { toCommunityViews } from "@/components/feed/types";

export const metadata = {
  title: "Buat post",
};

/**
 * Buat post /submit (PRD 6, wireframe PRD 22.3).
 * Wajib login (tamu → /login). Daftar komunitas diambil via getCommunities;
 * bila gagal, form tetap tampil dengan tombol muat ulang. Upload foto sengaja
 * belum ada (Fase 4).
 */
export default async function HalamanSubmit() {
  const sesiHasil = await ambilSesi();
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  if (!sesi) {
    redirect("/login");
  }

  const komunitasHasil = await ambilDaftarKomunitas();
  const komunitas = komunitasHasil.ok
    ? toCommunityViews(komunitasHasil.data)
    : [];
  const komunitasError = komunitasHasil.ok ? null : komunitasHasil.message;

  const alasanNonaktif =
    sesi.status === "suspended"
      ? "Akunmu sedang disuspend, jadi belum bisa membuat post."
      : sesi.status === "banned"
        ? "Akunmu diblokir, jadi tidak bisa membuat post."
        : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-4 text-lg font-bold text-foreground">Buat post</h1>
      <SubmitPostForm
        communities={komunitas
          .filter((k) => k.slug)
          .map((k) => ({ slug: k.slug, name: k.name }))}
        communitiesError={komunitasError}
        alasanNonaktif={alasanNonaktif}
      />
    </div>
  );
}
