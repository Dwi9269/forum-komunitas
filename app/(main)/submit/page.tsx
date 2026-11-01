import { redirect } from "next/navigation";
import SubmitPostForm from "@/components/SubmitPostForm";
import { ambilDaftarKomunitas, ambilSesi } from "@/components/feed/server-data";
import { toCommunityViews } from "@/components/feed/types";
import {
  getImageUploadGate,
  type ImageUploadGate,
} from "@/lib/actions/images";

export const metadata = {
  title: "Buat post",
};

/**
 * Buat post /submit (PRD 6, wireframe PRD 22.3).
 * Wajib login (tamu → /login). Daftar komunitas diambil via getCommunities;
 * bila gagal, form tetap tampil dengan tombol muat ulang.
 *
 * Gate foto proaktif (PRD 18.3.10): akun berumur < 24 jam melihat pemilih
 * foto nonaktif BESERTA alasannya SEBELUM mencoba (bukan baru ditolak saat
 * upload) — dihitung server-side dari umur akun (getImageUploadGate); DB
 * (can_upload) tetap penjaga akhir.
 */
export default async function HalamanSubmit() {
  const sesiHasil = await ambilSesi();
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  if (!sesi) {
    redirect("/login");
  }

  const [komunitasHasil, gateHasil] = await Promise.all([
    ambilDaftarKomunitas(),
    // Tidak pernah melempar pada praktiknya, tetapi tetap dijaga: gagal
    // hitung → gate terbuka (DB menegakkan saat upload sungguhan).
    getImageUploadGate().catch<ImageUploadGate>(() => ({
      allowed: true,
      reason: null,
    })),
  ]);
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

  // Alasan foto nonaktif hanya untuk akun aktif yang belum genap 24 jam
  // (PRD 18.3.10); suspend/ban sudah dilayani alasanNonaktif di atas.
  const alasanFotoNonaktif = alasanNonaktif ? null : gateHasil.reason;

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-4 text-lg font-bold text-foreground">Buat post</h1>
      <SubmitPostForm
        communities={komunitas
          .filter((k) => k.slug)
          .map((k) => ({ slug: k.slug, name: k.name }))}
        communitiesError={komunitasError}
        alasanNonaktif={alasanNonaktif}
        alasanFotoNonaktif={alasanFotoNonaktif}
      />
    </div>
  );
}
