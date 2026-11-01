"use server";

/**
 * Server action profil — PRD bagian 8 (kolom profiles), 18.1 (pengaturan
 * akun), 21 (validasi input), 24 (kontrak akses data).
 *
 * Aturan yang dijaga file ini:
 * - Hanya kolom yang diberi grant DB (migrasi 0003):
 *     `grant update (avatar_url, bio) on profiles to authenticated`
 *   role/status/suspended_until TIDAK pernah diubah klien (hanya via RPC
 *   moderasi, PRD 16.6); username tidak bisa diubah (tidak ada di grant).
 * - RLS profiles_update_own: hanya baris milik sendiri.
 * - Validasi cepat PRD 21: bio maksimal 200 karakter (CHECK skema),
 *   avatar harus URL publik bucket `avatars` atau path storage milik
 *   sendiri (`{user_id}/{file}`) yang dinormalkan menjadi URL publik.
 */

import {
  appError,
  extractErrorCode,
  type ActionResult,
  type AppError,
  type ErrorCode,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "./auth";
import { charLength } from "./validate";

// ============================================================
// Tipe & konstanta (kontrak untuk FRONTEND-AGENT)
// ============================================================

export interface UpdateProfileInput {
  /** Bio baru; string kosong = hapus bio (tersimpan null). */
  bio?: string;
  /**
   * URL publik bucket avatars (…/storage/v1/object/public/avatars/…) ATAU
   * path storage milik sendiri (`{user_id}/{file}` — dinormalkan ke URL
   * publik). String kosong = hapus avatar (tersimpan null).
   */
  avatarUrl?: string;
}

/** Batas skema profiles.bio (PRD 8 / 21). Tidak diekspor: file "use server". */
const BIO_MAX = 200;

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

/** URL publik Supabase Storage untuk bucket avatars: …/object/public/avatars/…. */
function isAvatarBucketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    return url.pathname.includes("/object/public/avatars/");
  } catch {
    return false;
  }
}

// ============================================================
// Aksi: perbarui profil sendiri (PRD 18.1; kolom grant avatar_url, bio)
// ============================================================

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    // Bio: trim dulu (PRD 20 kasus tepi 8), kosong → null, maks 200 code point.
    let bioValue: string | null | undefined;
    if (input.bio !== undefined) {
      const bio = (input.bio ?? "").trim();
      if (charLength(bio) > BIO_MAX) {
        return failure(appError("BIO_TOO_LONG"));
      }
      bioValue = bio === "" ? null : bio;
    }

    const supabase = await createClient();

    // Avatar: URL bucket avatars atau path milik sendiri; kosong → null.
    let avatarValue: string | null | undefined;
    if (input.avatarUrl !== undefined) {
      const raw = (input.avatarUrl ?? "").trim();
      if (raw === "") {
        avatarValue = null;
      } else if (/^https?:\/\//i.test(raw)) {
        if (!isAvatarBucketUrl(raw)) {
          return failure(appError("AVATAR_INVALID"));
        }
        avatarValue = raw;
      } else if (raw.startsWith(`${user.id}/`)) {
        // Path storage bucket avatars milik sendiri → simpan sebagai URL
        // publik agar konsisten dengan avatar_url hasil unggahan MEDIA-AGENT.
        avatarValue = supabase.storage
          .from("avatars")
          .getPublicUrl(raw).data.publicUrl;
      } else {
        return failure(appError("AVATAR_INVALID"));
      }
    }

    const patch: { bio?: string | null; avatar_url?: string | null } = {};
    if (bioValue !== undefined) {
      patch.bio = bioValue;
    }
    if (avatarValue !== undefined) {
      patch.avatar_url = avatarValue;
    }
    if (Object.keys(patch).length === 0) {
      // Tidak ada kolom yang diubah — tidak ada panggilan DB.
      return { ok: true, data: null };
    }

    // RLS profiles_update_own menjamin hanya baris sendiri; 0 baris berarti
    // profil hilang (kasus tepi — mis. profil gagal dibuat saat signup).
    const { count, error } = await supabase
      .from("profiles")
      .update(patch, { count: "exact" })
      .eq("id", user.id);
    if (error) {
      return failure(extractErrorCode(error));
    }
    if ((count ?? 0) === 0) {
      return failure(appError("NOT_FOUND"));
    }
    return { ok: true, data: null };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
