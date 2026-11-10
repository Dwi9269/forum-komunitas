# 📱 Panduan Pasang "APK" Forum (PWA)

Forum ini bukan APK biasa — dia **PWA (Progressive Web App)**: dipasang langsung dari browser tanpa Play Store, tanpa install ulang manual, dan **otomatis terupdate** setiap kali kodenya diperbarui. Ikon muncul di layar utama HP, dibuka layar penuh seperti aplikasi asli.

> ⚠️ Pasang hanya dari **https://www.chatasiqque.my.id** (dua huruf Q). Jangan pernah pasang dari tautan lain.

---

## Android (Chrome)

1. Buka **Chrome** → ketik `www.chatasiqque.my.id` → login seperti biasa.
2. Kalau banner kecil **"📱 Pasang aplikasi Forum"** muncul di bawah → klik **Pasang** → selesai ✅
3. Kalau banner tidak muncul: klik **titik tiga ⋮** (kanan atas Chrome) → pilih **"Install app"** / **"Tambahkan ke layar utama"** → konfirmasi **Pasang**.
4. Ikon **Forum Komunitas** muncul di layar utama → buka dari sana, tampil layar penuh tanpa address bar.

## iPhone / iPad (Safari)

1. Buka **Safari** (WAJIB Safari — Chrome di iOS tidak mendukung install PWA) → `www.chatasiqque.my.id`.
2. Klik ikon **Bagikan** ⬆️ (kotak dengan panah ke atas).
3. Scroll → pilih **"Tambahkan ke Layar Utama"** (Add to Home Screen) → **Tambah**.
4. Ikon muncul di layar utama ✅

## Catatan

- **Data & login tersimpan di aplikasinya** — tidak hilang walau cache browser dibersihkan (terpisah dari Chrome biasa).
- **Update otomatis**: begitu kamu push kode baru, PWA di HP pengguna memuat versi terbaru saat dibuka berikutnya. Tidak ada "update APK" manual.
- **Saat offline**: halaman "Kamu sedang offline" tampil, dan kembali normal saat internet pulih.
- **Kalau banner "Pasang" tidak muncul**: pastikan sudah pernah membuka situsnya 1–2 kali (Chrome menunggu situs "dikenal"), atau pakai jalur titik tiga ⋮ seperti langkah 3.
- **Menghapus**: tekan lama ikon → Hapus — sama seperti menghapus aplikasi biasa.

## Untuk pemilik forum (admin)

- Cek health PWA: DevTools desktop → tab **Application** → Manifest (harus terbaca) + Service Workers (status activated).
- Lighthouse → kategori PWA harus "Installable".
- Kalau suatu saat ganti tema/ikon: edit `public/icon.svg` dan `public/manifest.webmanifest`, push, selesai (pengguna otomatis dapat ikon baru).
