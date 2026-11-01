import Badge from "@/components/ui/Badge";

/**
 * Badge status untuk dashboard admin — Fase 4 (MOD). Fungsi murni tanpa hook,
 * aman dipakai dari Server maupun Client Component. Nilai status mengikuti
 * kontrak lib/actions/admin.ts (snake_case kolom DB).
 */

/** Status laporan (kolom reports.status): open | resolved | dismissed. */
export function ReportStatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge variant="warning">Terbuka</Badge>;
  if (status === "resolved") return <Badge variant="success">Selesai</Badge>;
  if (status === "dismissed") return <Badge variant="neutral">Ditolak</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

/** Status akun pengguna (kolom profiles.status): active | suspended | banned. */
export function UserStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Aktif</Badge>;
  if (status === "suspended") return <Badge variant="warning">Suspend</Badge>;
  if (status === "banned") return <Badge variant="danger">Diblokir</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

/** Peran pengguna (kolom profiles.role): member | moderator | admin. */
export function RoleBadge({ role }: { role: string }) {
  if (role === "admin") return <Badge variant="danger">Admin</Badge>;
  if (role === "moderator") return <Badge variant="primary">Moderator</Badge>;
  if (role === "member") return <Badge variant="neutral">Member</Badge>;
  return <Badge variant="neutral">{role}</Badge>;
}

/** Aksi moderasi (kolom mod_actions.action, PRD 16.6). */
export function ModActionBadge({ action }: { action: string }) {
  const peta: Record<string, { label: string; variant: "neutral" | "primary" | "success" | "warning" | "danger" }> = {
    hide: { label: "Sembunyikan", variant: "warning" },
    delete: { label: "Hapus", variant: "danger" },
    warn: { label: "Peringatkan", variant: "neutral" },
    suspend: { label: "Suspend", variant: "warning" },
    ban: { label: "Blokir", variant: "danger" },
    restore: { label: "Pulihkan", variant: "success" },
  };
  const temuan = peta[action];
  if (!temuan) return <Badge variant="neutral">{action}</Badge>;
  return <Badge variant={temuan.variant}>{temuan.label}</Badge>;
}

/** Tipe target moderasi: post | comment | user. */
export function TargetTypeBadge({ type }: { type: string }) {
  if (type === "post") return <Badge variant="primary">Post</Badge>;
  if (type === "comment") return <Badge variant="primary">Komentar</Badge>;
  if (type === "user") return <Badge variant="neutral">Pengguna</Badge>;
  return <Badge variant="neutral">{type}</Badge>;
}
