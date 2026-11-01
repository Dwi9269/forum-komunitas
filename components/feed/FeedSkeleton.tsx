/**
 * Skeleton daftar post untuk state loading (PRD 22.5: semua daftar punya
 * state loading). Dipakai app/(main)/loading.tsx saat navigasi.
 */
export default function FeedSkeleton({ jumlah = 4 }: { jumlah?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: jumlah }, (_, indeks) => (
        <div
          key={indeks}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
          <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-3 w-36 animate-pulse rounded bg-muted" />
        </div>
      ))}
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
