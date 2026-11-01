import Link from "next/link";

export const metadata = {
  title: "Kebijakan Privasi",
};

/**
 * Halaman legal Kebijakan Privasi (PRD 28.3) — garis besar siap pakai.
 */

const isi: { judul: string; teks: string }[] = [
  {
    judul: "Data yang dikumpulkan",
    teks: "Email, username, password (disimpan sebagai hash oleh Supabase), konten yang diunggah, dan catatan aktivitas teknis.",
  },
  {
    judul: "Tujuan penggunaan",
    teks: "Menjalankan layanan, keamanan, dan moderasi.",
  },
  {
    judul: "Penyimpanan",
    teks: "Pada penyedia infrastruktur: Supabase (database & storage, region Asia-Pasifik) dan Vercel (hosting aplikasi).",
  },
  {
    judul: "Berbagi data",
    teks: "Data tidak dijual. Dapat diberikan ke pihak berwenang sesuai hukum yang berlaku.",
  },
  {
    judul: "Hak pengguna",
    teks: "Mengubah profil dan menghapus akun beserta kontennya.",
  },
  {
    judul: "Foto",
    teks: "Metadata lokasi (EXIF) dihapus secara otomatis saat unggah.",
  },
];

export default function HalamanPrivacy() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-lg font-bold text-foreground">Kebijakan Privasi</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bagaimana Forum Komunitas mengelola data kamu.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {isi.map((bagian) => (
          <div key={bagian.judul}>
            <h2 className="text-sm font-semibold text-foreground">
              {bagian.judul}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {bagian.teks}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Lihat juga{" "}
        <Link href="/legal/terms" className="text-primary underline">
          Syarat &amp; Ketentuan
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
