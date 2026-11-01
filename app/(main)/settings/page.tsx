import { redirect } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import SettingsForm from "@/components/SettingsForm";
import { ambilSesi } from "@/components/feed/server-data";

export const metadata = {
  title: "Pengaturan",
};

/**
 * Pengaturan /settings (PRD 6): edit profil (bio + avatar, Fase 4) lewat
 * updateProfile. Wajib login (tamu → /login). Ganti password mengikuti alur
 * reset yang sudah ada (/reset).
 */
export default async function HalamanPengaturan() {
  const sesiHasil = await ambilSesi();
  const sesi = sesiHasil.ok ? sesiHasil.data : null;
  if (!sesi) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-lg font-bold text-foreground">Pengaturan</h1>

      <SettingsForm
        username={sesi.username}
        initialBio={sesi.bio ?? ""}
        initialAvatarUrl={sesi.avatarUrl}
      />

      {/* Ganti password (PRD 6 menyebut /settings untuk edit profil + password;
          alur ganti password memakai reset yang sudah ada). */}
      <Card>
        <h2 className="text-sm font-semibold text-foreground">
          Ganti password
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Untuk mengganti password, minta tautan reset lewat halaman lupa
          password lalu ikuti petunjuk di emailmu.
        </p>
        <Link
          href="/reset"
          className="mt-2 inline-flex w-fit rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Lupa password / ganti password
        </Link>
      </Card>
    </div>
  );
}
