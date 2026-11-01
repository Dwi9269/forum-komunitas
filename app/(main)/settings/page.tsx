import { redirect } from "next/navigation";
import Card from "@/components/ui/Card";
import SettingsForm from "@/components/SettingsForm";
import { ambilSesi } from "@/components/feed/server-data";

export const metadata = {
  title: "Pengaturan",
};

/**
 * Pengaturan /settings (PRD 6): edit profil (bio + avatar, Fase 4) lewat
 * updateProfile, dan ganti sandi (langsung via updatePassword atau tautan
 * email ala OTP via requestPasswordReset → /reset/confirm). Wajib login
 * (tamu → /login).
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
        email={sesi.email ?? ""}
        initialBio={sesi.bio ?? ""}
        initialAvatarUrl={sesi.avatarUrl}
      />
    </div>
  );
}
