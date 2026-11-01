import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Beranda (placeholder Fase 1).
 * Feed gabungan akan diisi pada fase berikutnya — fase ini belum ada backend aksi,
 * jadi hanya menampilkan header sederhana dan EmptyState.
 */
export default function BerandaPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="text-lg font-bold tracking-tight text-foreground">
            Forum Komunitas
          </span>
          {/* Tombol Masuk: nonaktif, placeholder sampai rute /login siap (Fase 2). */}
          <Button size="sm" disabled aria-label="Masuk (segera hadir)">
            Masuk
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col py-4">
        <EmptyState
          title="Belum ada postingan"
          description="Nantikan postingan pertama!"
          className="flex-1"
        />
      </main>
    </div>
  );
}
