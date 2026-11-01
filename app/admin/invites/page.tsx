import ErrorState from "@/components/ui/ErrorState";
import InvitesPanel from "@/components/admin/InvitesPanel";
import { aman } from "@/components/admin/server-data";
import { listInvites } from "@/lib/actions/admin";
import { getSessionUser } from "@/lib/actions/auth";

/**
 * Kode undangan dashboard admin (PRD 4.1, 18.6, 24). Data via listInvites;
 * pembuatan kode via createInvite (admin-only, kode dibuat server).
 */
export const metadata = {
  title: "Kode Undangan",
};

export default async function AdminUndanganPage() {
  const [hasil, sesiHasil] = await Promise.all([
    aman(() => listInvites()),
    aman(() => getSessionUser()),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;

  if (!hasil.ok) {
    return <ErrorState title="Gagal memuat kode undangan" message={hasil.message} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Kode Undangan
        </h2>
        <p className="text-sm text-muted-foreground">
          Pendaftaran butuh kode undangan yang belum habis dan belum
          kedaluwarsa (PRD 4.1).
        </p>
      </div>
      <InvitesPanel
        invites={hasil.data.invites}
        viewerRole={sesi?.role ?? "member"}
        kini={Date.now()}
      />
    </div>
  );
}
