import Link from "next/link";
import ErrorState from "@/components/ui/ErrorState";
import ReportsQueue from "@/components/admin/ReportsQueue";
import { aman } from "@/components/admin/server-data";
import { getReports, type ReportStatus } from "@/lib/actions/admin";

/**
 * Antrean laporan (halaman default /admin) — PRD 4.6, 18.6.4-5, wireframe 22.4.
 *
 * Filter status lewat query param (?status=open|resolved|dismissed) sehingga
 * halaman tetap Server Component; default "open" (antrean kerja moderator).
 * Data diambil via getReports (pre-cek moderator + RLS), aksi dijalankan di
 * ReportsQueue (client) lalu router.refresh() memuat ulang halaman ini.
 */
export const metadata = {
  title: "Antrean Laporan",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Terbuka" },
  { value: "resolved", label: "Selesai" },
  { value: "dismissed", label: "Ditolak" },
];

const pillClass = (aktif: boolean) =>
  `inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    aktif
      ? "bg-primary text-primary-foreground"
      : "bg-secondary text-secondary-foreground hover:bg-secondary-hover"
  }`;

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : "";
  const status: ReportStatus =
    statusParam === "resolved" || statusParam === "dismissed"
      ? statusParam
      : "open";

  const hasil = await aman(() => getReports(status));

  return (
    <div className="flex flex-col gap-4">
      {/* Filter status (wireframe 22.4: "Terbuka (7) Filter: ...") */}
      <nav aria-label="Filter status laporan" className="flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin?status=${f.value}`}
            className={pillClass(status === f.value)}
            aria-current={status === f.value ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {hasil.ok ? (
        <ReportsQueue reports={hasil.data.reports} status={status} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <ErrorState
            title="Gagal memuat laporan"
            message={hasil.message}
          />
          <Link
            href={`/admin?status=${status}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Muat ulang halaman
          </Link>
        </div>
      )}
    </div>
  );
}
