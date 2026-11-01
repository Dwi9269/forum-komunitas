import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron pembersihan file yatim (PRD 23.4) — dijalankan mingguan oleh Vercel
 * Cron (lihat vercel.json), dilindungi CRON_SECRET.
 *
 * Logika: bandingkan isi bucket dengan data yang terpakai
 * (post_images.storage_path + profiles.avatar_url), lalu hapus file yang
 * TIDAK terpakai dan lebih tua dari 24 jam — lewat Storage API, bukan SQL.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_POST_IMAGES = "post-images";
const UMA = 24 * 60 * 60 * 1000; // 24 jam (ms)

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

export async function GET(request: NextRequest) {
  const rahasia = process.env.CRON_SECRET;
  const otorisasi = request.headers.get("authorization");
  if (!rahasia || otorisasi !== `Bearer ${rahasia}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
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
  const { data: daftarFile, error: errDaftar } = await supabase.storage
    .from(BUCKET_POST_IMAGES)
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });

  if (errDaftar) {
    return NextResponse.json({ error: errDaftar.message }, { status: 500 });
  }

  const terpakaiFoto = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("post_images")
      .select("storage_path")
      .range(offset, offset + 999);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const baris of data ?? []) terpakaiFoto.add(baris.storage_path);
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const kandidatFoto = (daftarFile ?? [])
    .filter(
      (f) =>
        !terpakaiFoto.has(f.name) &&
        new Date(f.created_at ?? 0).getTime() < Date.now() - UMA,
    )
    .map((f) => f.name);

  if (kandidatFoto.length > 0) {
    const { error: errHapus } = await supabase.storage
      .from(BUCKET_POST_IMAGES)
      .remove(kandidatFoto);
    if (errHapus) {
      kesalahan.push(`post-images: ${errHapus.message}`);
    } else {
      terhapus += kandidatFoto.length;
    }
  }

  // ===== 2. Bucket avatars vs profiles.avatar_url =====
  const avatarsTerpakai = new Set<string>();
  offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .not("avatar_url", "is", null)
      .range(offset, offset + 999);
    if (error) {
      kesalahan.push(`profiles: ${error.message}`);
      break;
    }
    for (const baris of data ?? []) {
      const path = pathDariUrlPublik(baris.avatar_url ?? "", "avatars");
      if (path) avatarsTerpakai.add(path);
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const { data: daftarAvatar, error: errDaftarAvatar } = await supabase.storage
    .from("avatars")
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });

  if (errDaftarAvatar) {
    kesalahan.push(`avatars: ${errDaftarAvatar.message}`);
  } else {
    const kandidatAvatar = (daftarAvatar ?? [])
      .filter(
        (f) =>
          !avatarsTerpakai.has(f.name) &&
          new Date(f.created_at ?? 0).getTime() < Date.now() - UMA,
      )
      .map((f) => f.name);
    if (kandidatAvatar.length > 0) {
      const { error: errHapus } = await supabase.storage
        .from("avatars")
        .remove(kandidatAvatar);
      if (errHapus) {
        kesalahan.push(`avatars hapus: ${errHapus.message}`);
      } else {
        terhapus += kandidatAvatar.length;
      }
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
