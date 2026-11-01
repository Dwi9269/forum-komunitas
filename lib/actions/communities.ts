"use server";

/**
 * Server actions komunitas — PRD bagian 4.2 (Komunitas), 18.2 (kriteria
 * selesai), 24 (joinCommunity / leaveCommunity). Membuat/menghapus
 * komunitas hanya admin (MVP) — bagian dari aksi moderasi/admin, bukan file
 * ini.
 *
 * Catatan DB (FASE1-DB): tidak ada view statistik komunitas, dan RLS
 * `community_members` hanya mengizinkan membaca keanggotaan SENDIRI —
 * jumlah anggota/post per komunitas TIDAK bisa dihitung klien. Kolom
 * memberCount/postCount dikirim null; kebutuhan view statistik dicatat di
 * handoff Fase 3 untuk DB-AGENT berikutnya.
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
  /** Belum tersedia di DB Fase 1 (tidak ada view statistik) — selalu null. */
  memberCount: number | null;
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

    const [{ data: rows, error: listError }, { data: memberRows, error: memberError }] =
      await Promise.all([
        supabase
          .from("communities")
          .select("id, slug, name, description, created_at")
          .order("name", { ascending: true }),
        // RLS members_select_own: hanya keanggotaan sendiri yang terlihat.
        supabase.from("community_members").select("community_id").eq("user_id", user.id),
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
          memberCount: null,
          postCount: null,
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

    const { data: membership, error: memberError } = await supabase
      .from("community_members")
      .select("community_id")
      .eq("community_id", row.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) {
      return failure(extractErrorCode(memberError));
    }

    return {
      ok: true,
      data: {
        community: {
          ...row,
          memberCount: null,
          postCount: null,
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
