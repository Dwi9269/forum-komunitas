import ErrorState from "@/components/ui/ErrorState";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import UsersPanel from "@/components/admin/UsersPanel";
import { aman } from "@/components/admin/server-data";
import { listUsers } from "@/lib/actions/admin";
import { getSessionUser } from "@/lib/actions/auth";

/**
 * Daftar pengguna dashboard admin (PRD 4.6 "banned/suspend pengguna",
 * 18.6.5-6). Pencarian via form GET (?q=) sehingga bekerja tanpa JS dan tetap
 * Server Component; aksi suspend/blokir/reaktivasi di UsersPanel (client)
 * dengan dialog konfirmasi, semua via modApplyAction targetType "user".
 */
export const metadata = {
  title: "Pengguna",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPenggunaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 50) : "";

  const [hasil, sesiHasil] = await Promise.all([
    aman(() => listUsers(query || undefined)),
    aman(() => getSessionUser()),
  ]);
  const sesi = sesiHasil.ok ? sesiHasil.data : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Kotak pencarian (GET form — tanpa JS) */}
      <form action="/admin/users" method="get" className="flex items-start gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari username..."
          aria-label="Cari pengguna berdasarkan username"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" className="shrink-0">
          Cari
        </Button>
      </form>

      {hasil.ok && sesi ? (
        <UsersPanel
          users={hasil.data.users}
          viewerId={sesi.id}
          viewerRole={sesi.role}
        />
      ) : hasil.ok ? (
        <ErrorState
          title="Sesi tidak terbaca"
          message="Muat ulang halaman, atau login ulang sebagai moderator/admin."
        />
      ) : (
        <ErrorState title="Gagal memuat pengguna" message={hasil.message} />
      )}
    </div>
  );
}
