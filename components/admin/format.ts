/**
 * Label dan format kecil untuk dashboard admin — Fase 4 (MOD).
 * Murni fungsi (tanpa hook) sehingga aman dipakai Server maupun Client Component.
 */

/**
 * Label alasan laporan — nilai PERSIS CHECK kolom reports.reason (PRD 4.6,
 * kontrak lib/actions/reports.ts: spam | porn | violence_sara | doxxing | other).
 * Dipakai antrean laporan dan dialog lapor agar konsisten.
 */
export const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  porn: "Konten dewasa",
  violence_sara: "SARA / kekerasan",
  doxxing: "Doxxing",
  other: "Lainnya",
};

/** Label alasan; nilai tak dikenal ditampilkan apa adanya (aman ke depan). */
export function labelAlasan(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

/**
 * Tanggal-waktu absolut bahasa Indonesia (mis. "12 Mar 2026, 14.05") untuk
 * data admin yang butuh presisi (suspend sampai, kode kedaluwarsa, dibuat).
 * ISO tidak valid → null (pemanggil memutuskan fallback).
 */
export function formatTanggal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const waktu = new Date(iso).getTime();
  if (!Number.isFinite(waktu)) return null;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(waktu));
  } catch {
    return new Date(waktu).toISOString().slice(0, 10);
  }
}

/** Potong uuid untuk tampilan log (mis. "8f3e…" tanpa prefix "..."). */
export function idPendek(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
