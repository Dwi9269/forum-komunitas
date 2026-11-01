import Link from "next/link";
import Card from "@/components/ui/Card";

export const metadata = {
  title: "Aturan komunitas",
};

/**
 * Halaman aturan komunitas /rules — teks persis PRD 28.1 (Aturan komunitas,
 * siap pakai). Halaman ini tujuan tautan "Baca aturan" pada banner status
 * akun (AccountStatusBanner, rulesHref default "/rules").
 *
 * CATATAN PEMILIKAN: folder app/legal dijadwalkan milik DEVOPS-AGENT untuk
 * terms/privacy — halaman rules ini dibuat lebih dulu oleh FRONTEND-AGENT
 * (Fase 4) karena dibutuhkan banner; JANGAN dipindah/dihapus tanpa koordinasi
 * (detail di docs/handoff/FASE4-FRONTEND.md).
 */

const ATURAN: string[] = [
  "Ngobrol bebas, termasuk bahasa kasar dan opini keras, selama tidak melanggar aturan di bawah.",
  "Dilarang konten porno atau seksual eksplisit.",
  "Dilarang segala konten yang melibatkan anak di bawah umur secara seksual. Pelanggaran langsung diblokir permanen dan dapat dilaporkan ke pihak berwenang.",
  "Dilarang ancaman, ajakan kekerasan, dan ujaran kebencian yang memicu kekerasan.",
  "Dilarang menyebarkan data pribadi orang lain (alamat, nomor telepon, foto pribadi tanpa izin).",
  "Dilarang spam, penipuan, dan promosi berlebihan.",
  "Dilarang konten yang melanggar hukum Indonesia.",
  "Keputusan moderator bersifat final. Banding bisa diajukan lewat email kontak.",
];

export default function HalamanAturan() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-6">
      <Link
        href="/"
        className="w-fit text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ← Kembali
      </Link>

      <Card className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Aturan komunitas
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Dengan memakai forum ini, kamu menyetujui aturan berikut. Aturan
            berlaku untuk semua post, komentar, dan foto.
          </p>
        </div>

        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-foreground">
          {ATURAN.map((aturan, indeks) => (
            <li key={indeks} className="pl-1">
              {aturan}
            </li>
          ))}
        </ol>

        <p className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Melanggar aturan? Konten bisa dilaporkan lewat menu titik tiga pada
          post atau komentar, lalu pilih <strong>Lapor</strong>. Moderator akan
          meninjau laporanmu.
        </p>
      </Card>
    </div>
  );
}
