import Link from "next/link";

export const metadata = {
  title: "Syarat & Ketentuan",
};

/**
 * Halaman legal Syarat & Ketentuan (PRD 28.2) — garis besar siap pakai.
 * Sesuaikan sebelum memperbesar skala layanan.
 */

const poin = [
  "Pengguna minimal berusia 17 tahun.",
  "Pengguna bertanggung jawab atas konten yang diunggah dan menjamin memiliki haknya.",
  "Pengguna memberi platform lisensi non-eksklusif untuk menampilkan konten di dalam layanan.",
  "Platform berhak menghapus konten dan menonaktifkan akun yang melanggar tanpa pemberitahuan sebelumnya.",
  "Layanan disediakan apa adanya, tanpa jaminan ketersediaan.",
  "Posting anonim hanya anonim bagi pengguna lain, bukan bagi pengelola. Pengelola dapat melihat identitas penulis untuk keperluan moderasi dan permintaan sah dari pihak berwenang.",
  "Hukum yang berlaku adalah hukum Republik Indonesia.",
];

export default function HalamanTerms() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-lg font-bold text-foreground">Syarat &amp; Ketentuan</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dengan menggunakan Forum Komunitas, kamu menyetujui ketentuan berikut.
      </p>
      <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
        {poin.map((teks) => (
          <li key={teks}>{teks}</li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Lihat juga{" "}
        <Link href="/legal/privacy" className="text-primary underline">
          Kebijakan Privasi
        </Link>{" "}
        dan{" "}
        <Link href="/legal/rules" className="text-primary underline">
          Aturan Komunitas
        </Link>
        .
      </p>
    </div>
  );
}
