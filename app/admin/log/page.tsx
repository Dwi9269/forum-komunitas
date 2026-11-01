import Link from "next/link";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { ModActionBadge, TargetTypeBadge } from "@/components/admin/StatusBadge";
import { idPendek } from "@/components/admin/format";
import { waktuRelatif } from "@/components/feed/types";
import { aman } from "@/components/admin/server-data";
import { getModLog } from "@/lib/actions/admin";

/**
 * Log tindakan moderasi (PRD 4.6 "Log tindakan moderasi", 16.6: semua tindakan
 * lewat RPC sehingga selalu tercatat di mod_actions). Read-only, terbaru dulu
 * (default 100 entri) — moderator, aksi, target, alasan, waktu.
 */
export const metadata = {
  title: "Log Moderasi",
};

export default async function AdminLogPage() {
  const hasil = await aman(() => getModLog(100));

  if (!hasil.ok) {
    return (
      <div className="flex flex-col items-center gap-3">
        <ErrorState title="Gagal memuat log" message={hasil.message} />
        <Link
          href="/admin/log"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Muat ulang halaman
        </Link>
      </div>
    );
  }

  const actions = hasil.data.actions;

  if (actions.length === 0) {
    return (
      <EmptyState
        title="Belum ada tindakan moderasi"
        description="Semua tindakan lewat RPC moderasi akan tercatat di sini."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Log Moderasi
        </h2>
        <p className="text-sm text-muted-foreground">
          {actions.length} tindakan terbaru. Setiap aksi moderator/blokir lewat
          RPC mod_apply_action / mod_dismiss_reports tercatat otomatis (PRD 16.6).
        </p>
      </div>

      <Card padded={false} className="divide-y divide-border">
        {actions.map((aksi) => (
          <div key={aksi.id} className="flex flex-col gap-1 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <ModActionBadge action={aksi.action} />
              <TargetTypeBadge type={aksi.target_type} />
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                title={aksi.target_id}
              >
                {idPendek(aksi.target_id)}
              </code>
              <span className="ml-auto text-xs text-muted-foreground">
                {waktuRelatif(aksi.created_at)}
              </span>
            </div>
            <p className="text-sm text-foreground">
              Oleh{" "}
              <span className="font-medium">
                @{aksi.moderator_username ?? "(tidak terbaca)"}
              </span>
            </p>
            {aksi.reason && (
              <p className="text-sm text-muted-foreground">“{aksi.reason}”</p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
