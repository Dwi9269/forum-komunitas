"use server";

/**
 * Server actions komunitas — PRD bagian 4.2 (Komunitas), 18.2 (kriteria
 * selesai), 24 (joinCommunity / leaveCommunity). Membuat/menghapus
 * komunitas hanya admin (MVP) — bagian dari aksi moderasi/admin, bukan file
 * ini.
 *
 * Catatan DB: RLS `community_members` hanya mengizinkan membaca keanggotaan
 * SENDIRI — jumlah anggota/post per komunitas tidak bisa dihitung klien.
 * Sejak migrasi 0005, view `community_stats` (definer; kolom persis
 * community_id, member_count, post_count; grant SELECT ke authenticated)
 * menyediakan angkanya — dibaca SEKALI lalu dipetakan by id (bukan query
 * per komunitas). Gagal membaca view tidak menggagalkan permintaan: angka
 * jatuh ke null (UI menyembunyikan angka).
 */

import {
  appError,
  extractErrorCode,
  type ActionResult,
  type AppError,
  type ErrorCode,
} from "@/lib/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "./auth";

// ============================================================
// Tipe (kontrak untuk FRONTEND-AGENT)
// ============================================================

export interface CommunitySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  /** Jumlah anggota dari view community_stats (migrasi 0005); null bila gagal dibaca. */
  memberCount: number | null;
  /** Jumlah post terlihat dari view community_stats; null bila gagal dibaca. */
  postCount: number | null;
  /** Status keanggotaan pengguna sesi terhadap komunitas ini. */
  isJoined: boolean;
}

interface CommunityRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
}

/** Baris view community_stats (migrasi 0005) — nama kolom persis di DB. */
interface CommunityStatsRow {
  community_id: string;
  member_count: number | null;
  post_count: number | null;
}

interface CommunityStats {
  memberCount: number | null;
  postCount: number | null;
}

/**
 * Baca view `community_stats` SEKALI lalu petakan by community_id.
 * Bila `ids` diberikan, hanya komunitas itu yang dimuat (.in); tanpa ids
 * seluruh view (tabel kecil) dibaca. Kegagalan (RLS/jaringan) → peta kosong;
 * pemanggil memakai memberCount/postCount null (bukan error fatal).
 */
async function fetchCommunityStats(
  supabase: SupabaseClient,
  ids?: string[],
): Promise<Map<string, CommunityStats>> {
  const peta = new Map<string, CommunityStats>();
  try {
    if (ids && ids.length === 0) {
      return peta;
    }
    let query = supabase
      .from("community_stats")
      .select("community_id, member_count, post_count");
    if (ids) {
      query = query.in("community_id", ids);
    }
    const { data, error } = await query;
    if (error) {
      return peta;
    }
    for (const row of (data ?? []) as CommunityStatsRow[]) {
      peta.set(row.community_id, {
        memberCount: row.member_count ?? null,
        postCount: row.post_count ?? null,
      });
    }
  } catch {
    // View tidak terbaca → angka tetap null; halaman tetap tampil.
  }
  return peta;
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

/** Verifikasi komunitas ada (tabel communities boleh dibaca authenticated). */
async function communityExists(
  supabase: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; error: AppError }> {
  try {
    const { data, error } = await supabase
      .from("communities")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return { ok: false, error: extractErrorCode(error) };
    }
    if (!data) {
      return { ok: false, error: appError("NOT_FOUND") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: extractErrorCode(e) };
  }
}

// ============================================================
// Aksi: daftar komunitas (PRD 4.2; PRD 18.2.1 ajakan memilih komunitas)
// ============================================================

export async function getCommunities(): Promise<ActionResult<{
  communities: CommunitySummary[];
}>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }
    const supabase = await createClient();

    const [
      { data: rows, error: listError },
      { data: memberRows, error: memberError },
      stats,
    ] = await Promise.all([
      supabase
        .from("communities")
        .select("id, slug, name, description, created_at")
        .order("name", { ascending: true }),
      // RLS members_select_own: hanya keanggotaan sendiri yang terlihat.
      supabase.from("community_members").select("community_id").eq("user_id", user.id),
      // View community_stats (0005): jumlah anggota/post semua komunitas —
      // dibaca sekali, dipetakan by id (PRD 18.2.3).
      fetchCommunityStats(supabase),
    ]);
    if (listError) {
      return failure(extractErrorCode(listError));
    }
    if (memberError) {
      return failure(extractErrorCode(memberError));
    }

    const joined = new Set(
      ((memberRows ?? []) as { community_id: string }[]).map((row) => row.community_id),
    );
    return {
      ok: true,
      data: {
        communities: ((rows ?? []) as CommunityRow[]).map((row) => ({
          ...row,
          memberCount: stats.get(row.id)?.memberCount ?? null,
          postCount: stats.get(row.id)?.postCount ?? null,
          isJoined: joined.has(row.id),
        })),
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: detail komunitas by slug (PRD 18.2.3 — halaman /c/[slug])
// ============================================================

export async function getCommunityBySlug(
  slug: string,
): Promise<ActionResult<{ community: CommunitySummary }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const key = slug?.trim() ?? "";
    if (!key) {
      return failure(appError("NOT_FOUND"));
    }
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("communities")
      .select("id, slug, name, description, created_at")
      .eq("slug", key)
      .maybeSingle();
    if (error) {
      return failure(extractErrorCode(error));
    }
    if (!data) {
      return failure(appError("NOT_FOUND"));
    }
    const row = data as CommunityRow;

    const [{ data: membership, error: memberError }, stats] = await Promise.all([
      supabase
        .from("community_members")
        .select("community_id")
        .eq("community_id", row.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      // Statistik komunitas ini dari view community_stats (PRD 18.2.3) —
      // satu bacaan by id, bukan per komunitas berulang.
      fetchCommunityStats(supabase, [row.id]),
    ]);
    if (memberError) {
      return failure(extractErrorCode(memberError));
    }

    return {
      ok: true,
      data: {
        community: {
          ...row,
          memberCount: stats.get(row.id)?.memberCount ?? null,
          postCount: stats.get(row.id)?.postCount ?? null,
          isJoined: membership !== null,
        },
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Aksi: gabung / keluar (PRD 24 joinCommunity / leaveCommunity; PRD 18.2.2)
// ============================================================

export async function joinCommunity(
  communityId: string,
): Promise<ActionResult<{ joined: boolean }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const id = communityId?.trim() ?? "";
    if (!id) {
      return failure(appError("NOT_FOUND"));
    }
    const supabase = await createClient();

    const exists = await communityExists(supabase, id);
    if (!exists.ok) {
      return failure(exists.error);
    }

    // RLS members_join: user_id = auth.uid() dan is_active_user() — akun
    // suspended ditolak di sini (RLS_DENIED, PRD 20 kasus tepi 2).
    const { error } = await supabase
      .from("community_members")
      .insert({ community_id: id, user_id: user.id });
    if (error) {
      // 23505 (PK community_members) = sudah jadi anggota → idempoten, sukses.
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, data: { joined: true } };
      }
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: { joined: true } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

export async function leaveCommunity(
  communityId: string,
): Promise<ActionResult<{ joined: boolean }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    const id = communityId?.trim() ?? "";
    if (!id) {
      return failure(appError("NOT_FOUND"));
    }
    const supabase = await createClient();

    const exists = await communityExists(supabase, id);
    if (!exists.ok) {
      return failure(exists.error);
    }

    // RLS members_leave: hanya baris sendiri. Bukan anggota → count 0 →
    // tetap sukses (idempoten, joined=false).
    const { error } = await supabase
      .from("community_members")
      .delete()
      .eq("community_id", id)
      .eq("user_id", user.id);
    if (error) {
      return failure(extractErrorCode(error));
    }
    return { ok: true, data: { joined: false } };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
