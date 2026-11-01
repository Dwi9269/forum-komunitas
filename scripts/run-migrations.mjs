/**
 * Runner migrasi + uji RLS untuk proyek Supabase Forum Komunitas.
 *
 * Pakai: set SUPA_DB_PASSWORD=<password-db> && node scripts/run-migrations.mjs [--tests]
 * Kredensial TIDAK disimpan di file — hanya lewat environment shell.
 * Urutan koneksi: session pooler (IPv4) dulu, lalu direct host.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF = "irmmdnipacvrcoospjcp";
const PASSWORD = process.env.SUPA_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPA_DB_PASSWORD tidak di-set.");
  process.exit(1);
}

const candidates = [
  { label: "session pooler", host: `aws-0-ap-northeast-2.pooler.supabase.com`, port: 5432, user: `postgres.${REF}` },
  { label: "direct", host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
];

async function connect() {
  for (const c of candidates) {
    const client = new pg.Client({
      ...c,
      database: "postgres",
      password: PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      console.log(`Terhubung via ${c.label} (${c.host})`);
      return client;
    } catch (e) {
      console.log(`Gagal ${c.label}: ${String(e.message).split("\n")[0]}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("Tidak bisa terhubung ke database lewat jalur mana pun.");
}

const client = await connect();
const notices = [];
client.on("notice", (n) => notices.push(n.message ?? String(n)));

// 1. Terapkan migrasi berurutan dengan tabel penanda supaya aman diulang.
await client.query(
  `create schema if not exists private;
   create table if not exists private.app_migrations (
     name text primary key,
     applied_at timestamptz not null default now()
   );`
);

const migDir = join(__dirname, "..", "supabase", "migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

let gagalMigrasi = false;
for (const f of files) {
  const dup = await client.query("select 1 from private.app_migrations where name = $1", [f]);
  if (dup.rowCount > 0) {
    console.log(`LEWATI (sudah diterapkan): ${f}`);
    continue;
  }
  const sql = readFileSync(join(migDir, f), "utf8");
  try {
    await client.query(`BEGIN;\n${sql}\nCOMMIT;`);
    await client.query("insert into private.app_migrations(name) values ($1)", [f]);
    console.log(`TERAPKAN: ${f}`);
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(`GAGAL di ${f}: ${e.message}`);
    gagalMigrasi = true;
    break;
  }
}

// 2. Uji RLS (--tests): berkas mengelola BEGIN/ROLLBACK sendiri; hasil lewat notice OK/GAGAL.
if (process.argv.includes("--tests") && !gagalMigrasi) {
  notices.length = 0;
  const tsql = readFileSync(join(__dirname, "..", "supabase", "tests", "rls_checks.sql"), "utf8");
  try {
    await client.query(tsql);
  } catch (e) {
    console.error(`ERROR saat menjalankan berkas uji: ${e.message}`);
  }
  const ok = notices.filter((m) => m.startsWith("OK"));
  const gagal = notices.filter((m) => m.startsWith("GAGAL"));
  console.log("--- HASIL UJI RLS ---");
  for (const m of [...ok, ...gagal]) console.log(m);
  console.log(`--- RINGKASAN: ${ok.length} OK, ${gagal.length} GAGAL ---`);
  await client.end();
  process.exit(gagal.length > 0 ? 2 : 0);
}

await client.end();
process.exit(gagalMigrasi ? 1 : 0);
