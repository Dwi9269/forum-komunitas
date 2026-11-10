import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cron pembersihan file yatim (PRD 23.4) — dijalankan mingguan oleh Vercel
 * Cron (lihat vercel.json), dilindungi CRON_SECRET.
 *
 * Logika: bandingkan isi bucket dengan data yang terpakai
 * (post_images.storage_path + profiles.avatar_url), lalu hapus file yang
 * TIDAK terpakai dan lebih tua dari 24 jam — lewat Storage API, bukan SQL.
 *
 * File disimpan di path `{user_id}/{nama-file}`, jadi isi bucket harus
 * ditelusuri sampai ke dalam subfolder (list("") hanya mengembalikan folder
 * tingkat atas).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_POST_IMAGES = "post-images";
const BUCKET_AVATARS = "avatars";
const UMA = 24 * 60 * 60 * 1000; // 24 jam (ms)
const PAGE = 1000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Env Supabase tidak lengkap");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Ambil path bucket dari URL publik avatar (…/object/public/avatars/<path>). */
function pathDariUrlPublik(url: string, bucket: string): string | null {
  const penanda = `/object/public/${bucket}/`;
  const i = url.indexOf(penanda);
  return i === -1 ? null : url.slice(i + penanda.length);
}

interface BerkasStorage {
  /** Path lengkap di bucket, mis. `{user_id}/{uuid}.webp`. */
  path: string;
  createdAt: number | null;
}

/**
 * Telusuri seluruh isi bucket (rekursif ke subfolder, dengan paginasi).
 * Entri folder dari Storage API ditandai `id === null`.
 */
async function daftarSemuaBerkas(
  supabase: SupabaseClient,
  bucket: string,
): Promise<BerkasStorage[]> {
  const hasil: BerkasStorage[] = [];
  const antrianFolder: string[] = [""];

  while (antrianFolder.length > 0) {
    const prefix = antrianFolder.pop() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        throw new Error(error.message);
      }
      for (const item of data ?? []) {
        // Penanda folder kosong buatan dashboard — bukan file pengguna.
        if (item.name.startsWith(".emptyFolderPlaceholder")) continue;
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          antrianFolder.push(path);
        } else {
          const t = item.created_at ? new Date(item.created_at).getTime() : NaN;
          hasil.push({ path, createdAt: Number.isFinite(t) ? t : null });
        }
      }
      if (!data || data.length < PAGE) break;
      offset += PAGE;
    }
  }
  return hasil;
}

/** File yatim = tidak terpakai DAN umurnya jelas lebih dari 24 jam. */
function pilihYatim(berkas: BerkasStorage[], terpakai: Set<string>): string[] {
  const batas = Date.now() - UMA;
  return berkas
    .filter(
      (f) =>
        !terpakai.has(f.path) && f.createdAt !== null && f.createdAt < batas,
    )
    .map((f) => f.path);
}

/** Hapus dalam potongan agar permintaan tidak terlalu besar. */
async function hapusBerkas(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<{ terhapus: number; error: string | null }> {
  let terhapus = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const potongan = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(potongan);
    if (error) {
      return { terhapus, error: error.message };
    }
    terhapus += potongan.length;
  }
  return { terhapus, error: null };
}

export async function GET(request: NextRequest) {
  const rahasia = process.env.CRON_SECRET;
  const otorisasi = request.headers.get("authorization");
  if (!rahasia || otorisasi !== `Bearer ${rahasia}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = adminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Env error" },
      { status: 500 },
    );
  }

  const batasWaktu = new Date(Date.now() - UMA).toISOString();
  let terhapus = 0;
  const kesalahan: string[] = [];

  // ===== 1. Bucket post-images vs tabel post_images =====
  let berkasFoto: BerkasStorage[];
  try {
    berkasFoto = await daftarSemuaBerkas(supabase, BUCKET_POST_IMAGES);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal membaca bucket" },
      { status: 500 },
    );
  }

  const terpakaiFoto = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("post_images")
      .select("storage_path")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const baris of data ?? []) terpakaiFoto.add(baris.storage_path);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  const kandidatFoto = pilihYatim(berkasFoto, terpakaiFoto);
  if (kandidatFoto.length > 0) {
    const r = await hapusBerkas(supabase, BUCKET_POST_IMAGES, kandidatFoto);
    terhapus += r.terhapus;
    if (r.error) kesalahan.push(`post-images: ${r.error}`);
  }

  // ===== 2. Bucket avatars vs profiles.avatar_url =====
  // Bila pembacaan profiles gagal, daftar "terpakai" tidak lengkap —
  // JANGAN menghapus apa pun agar avatar yang sedang dipakai tidak hilang.
  const avatarsTerpakai = new Set<string>();
  let profilLengkap = true;
  offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .not("avatar_url", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      kesalahan.push(`profiles: ${error.message}`);
      profilLengkap = false;
      break;
    }
    for (const baris of data ?? []) {
      const path = pathDariUrlPublik(baris.avatar_url ?? "", BUCKET_AVATARS);
      if (path) avatarsTerpakai.add(path);
    }
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  if (profilLengkap) {
    try {
      const berkasAvatar = await daftarSemuaBerkas(supabase, BUCKET_AVATARS);
      const kandidatAvatar = pilihYatim(berkasAvatar, avatarsTerpakai);
      if (kandidatAvatar.length > 0) {
        const r = await hapusBerkas(supabase, BUCKET_AVATARS, kandidatAvatar);
        terhapus += r.terhapus;
        if (r.error) kesalahan.push(`avatars hapus: ${r.error}`);
      }
    } catch (e) {
      kesalahan.push(
        `avatars: ${e instanceof Error ? e.message : "gagal membaca bucket"}`,
      );
    }
  }

  return NextResponse.json({
    ok: kesalahan.length === 0,
    berjalanPada: new Date().toISOString(),
    batasUmur: batasWaktu,
    fileTerhapus: terhapus,
    kesalahan,
  });
}
