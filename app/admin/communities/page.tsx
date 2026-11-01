import ErrorState from "@/components/ui/ErrorState";
import CommunitiesPanel from "@/components/admin/CommunitiesPanel";
import { aman } from "@/components/admin/server-data";
import { listCommunitiesAdmin } from "@/lib/actions/admin";
import { getSessionUser } from "@/lib/actions/auth";

/**
 * Komunitas dashboard admin (PRD 4.2, 18.6). Data via listCommunitiesAdmin
 * (statistik member/post dari view community_stats — null bila view belum
 * tersedia); buat/edit via createCommunity/updateCommunity (admin-only).
 */
export const metadata = {
  title: "Komunitas",
};

export default async function AdminKomunitasPage() {
  const [hasil, sesiHasil] = await Promise.all([
    aman(() => listCommunitiesAdmin()),
    aman(() => getSessionUser()),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;

  if (!hasil.ok) {
    return <ErrorState title="Gagal memuat komunitas" message={hasil.message} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Komunitas</h2>
        <p className="text-sm text-muted-foreground">
          Kelola daftar komunitas forum.
        </p>
      </div>
      <CommunitiesPanel
        communities={hasil.data.communities}
        viewerRole={sesi?.role ?? "member"}
      />
    </div>
  );
}
