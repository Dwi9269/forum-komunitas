/**
 * Diagnostik sementara #4: payload RSC beranda versi ADMIN (sandi baru),
 * bedah semua kemunculan error/stack/file di dalamnya.
 */
const REF = "irmmdnipacvrcoospjcp";
const URL_DB = `https://${REF}.supabase.co`;
const ANON = "sb_publishable_2ysYj-gqRLy2vJPPY89ZmQ_tjDHmDt8";

const authRes = await fetch(`${URL_DB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "dwijr926@gmail.com", password: "dwijr926@" }),
});
const sesi = await authRes.json();
if (!sesi.access_token) {
  console.log("LOGIN_GAGAL:", JSON.stringify(sesi).slice(0, 200));
  process.exit(1);
}
console.log("LOGIN_OK:", sesi.user?.email);

const nilaiCookie = "base64-" + Buffer.from(JSON.stringify(sesi), "utf8").toString("base64url");
const r = await fetch("http://localhost:3000/", {
  headers: { RSC: "1", Cookie: `sb-${REF}-auth-token=${nilaiCookie}` },
});
const teks = await r.text();
console.log("STATUS:", r.status, "PANJANG:", teks.length);

function konteks(kata, radius, maks) {
  const hasil = [];
  let i = teks.indexOf(kata);
  while (i !== -1 && hasil.length < maks) {
    hasil.push(teks.slice(Math.max(0, i - radius), i + radius));
    i = teks.indexOf(kata, i + 1);
  }
  return hasil;
}

for (const p of konteks("digest", 200, 5)) {
  console.log("=== DIGEST ===\n" + p.replaceAll("\n", "\\n"));
}
for (const p of konteks('"reason"', 350, 6)) {
  console.log("=== REASON ===\n" + p.replaceAll("\n", "\\n"));
}
for (const p of konteks("Error", 200, 6)) {
  console.log("=== ERROR ===\n" + p.replaceAll("\n", "\\n"));
}
const file = new Set();
let m;
const polaFile = /([A-Za-z0-9 _()\\/.-]{3,120}\.(?:tsx|ts)):\d+/g;
while ((m = polaFile.exec(teks)) !== null) file.add(m[1]);
console.log("FILE:", [...file].slice(0, 30));
