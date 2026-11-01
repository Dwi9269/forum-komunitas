/**
 * Eksekutor SQL generik: node scripts/exec-sql.mjs <berkas.sql>
 * Mencetak hasil SELECT (baris) dan notice OK/GAGAL. Kredensial via SUPA_DB_PASSWORD.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const REF = "irmmdnipacvrcoospjcp";
const PASSWORD = process.env.SUPA_DB_PASSWORD;
if (!PASSWORD || process.argv.length < 3) {
  console.error("Pakai: set \"SUPA_DB_PASSWORD=...\" && node scripts/exec-sql.mjs <berkas.sql>");
  process.exit(1);
}

const client = new pg.Client({
  host: `aws-0-ap-northeast-2.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${REF}`,
  database: "postgres",
  password: PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();

const notices = [];
client.on("notice", (n) => notices.push(n.message ?? String(n)));

const sql = readFileSync(process.argv[2], "utf8");
try {
  const res = await client.query(sql);
  const rows = Array.isArray(res) ? res.flatMap((r) => r.rows ?? []) : (res.rows ?? []);
  for (const row of rows) console.log(JSON.stringify(row));
} catch (e) {
  console.error(`ERROR: ${e.message}`);
}
for (const m of notices) console.log(`NOTICE: ${m}`);
await client.end();
