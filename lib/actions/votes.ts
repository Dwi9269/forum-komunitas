"use server";

/**
 * Server actions vote — PRD bagian 4.5 (Vote), 16.3 (trigger apply_vote_delta
 * menghitung skor), 18.5 (kriteria selesai), 20 (Kasus Tepi), 24 (Kontrak).
 *
 * Aturan keras yang dijaga file ini:
 * - Skor TIDAK pernah ditulis klien: trigger DB apply_vote_delta yang
 *   mengubah posts.score / comments.score saat votes berubah.
 * - Satu suara per pengguna per item dijamin PK votes
 *   (user_id, target_type, target_id) — PRD 18.5.3 / 20 kasus tepi 4.
 * - Skor terbaru dibaca lewat view posts_feed / comments_view (bukan tabel
 *   mentah) agar konsisten dengan aturan penyamaran anonim.
 *
 * Kontrak PRD 24: setVote(tipe, id, nilai -1|0|1). Wrapper setVotePost /
 * setVoteComment disediakan agar UI post/komentar cukup memanggil satu
 * fungsi. Semua mengembalikan skor terbaru + vote pengguna agar UI bisa
 * mengganti angka optimistic dengan nilai otoritatif (PRD 18.5.2).
 *
 * Pengguna belum verifikasi email (tanpa sesi) atau suspended ditolak oleh
 * RLS votes_* (is_active_user) → LOGIN_REQUIRED / RLS_DENIED (PRD 18.5.4).
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

// ============================================================
// Tipe (kontrak untuk FRONTEND-AGENT)
// ============================================================

export type VoteTargetType = "post" | "comment";
export type VoteValue = -1 | 0 | 1;

export interface VoteState {
  /**
   * Skor terbaru target; null bila target sudah tidak terlihat (post/
   * komentar terhapus/disembunyikan) — UI kembali ke nilai optimistic.
   */
  score: number | null;
  /** Vote pengguna sesi saat ini; null = tidak sedang memilih. */
  myVote: VoteValue | null;
}

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

// ============================================================
// Aksi: set vote (PRD 24 setVote: tipe, id, nilai -1/0/1)
// ============================================================

export async function setVote(
  targetType: VoteTargetType,
  targetId: string,
  value: VoteValue,
): Promise<ActionResult<VoteState>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    if (
      (targetType !== "post" && targetType !== "comment") ||
      (value !== -1 && value !== 0 && value !== 1)
    ) {
      return failure(appError("VOTE_INVALID"));
    }
    const id = targetId?.trim() ?? "";
    if (!id) {
      return failure(appError("VOTE_INVALID"));
    }

    const supabase = await createClient();

    if (value === 0) {
      // Nilai 0 = tarik suara (PRD 18.5.1: klik ulang membatalkan vote).
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("user_id", user.id)
        .eq("target_type", targetType)
        .eq("target_id", id);
      if (error) {
        return failure(extractErrorCode(error));
      }
    } else {
      // Upsert: PK votes mencegah vote ganda; mengganti arah vote memakai
      // jalur update (PRD 18.5.1; PRD 20 kasus tepi 4 "hasil terakhir menang").
      const { error } = await supabase
        .from("votes")
        .upsert(
          { user_id: user.id, target_type: targetType, target_id: id, value },
          { onConflict: "user_id,target_type,target_id" },
        );
      if (error) {
        return failure(extractErrorCode(error));
      }
    }

    // Baca skor terbaru dari view (bukan tabel mentah). Target yang sudah
    // dihapus/disembunyikan tidak ada di view → score null.
    const view = targetType === "post" ? "posts_feed" : "comments_view";
    const { data, error: readError } = await supabase
      .from(view)
      .select("score, my_vote")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      return failure(extractErrorCode(readError));
    }

    const row = data as { score: number; my_vote: number | null } | null;
    return {
      ok: true,
      data: {
        score: row?.score ?? null,
        myVote:
          row && (row.my_vote === 1 || row.my_vote === -1 || row.my_vote === 0)
            ? row.my_vote
            : null,
      },
    };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}

// ============================================================
// Wrapper nyaman untuk UI
// ============================================================

/** Vote post — sama dengan setVote("post", postId, value). */
export async function setVotePost(
  postId: string,
  value: VoteValue,
): Promise<ActionResult<VoteState>> {
  return setVote("post", postId, value);
}

/** Vote komentar — sama dengan setVote("comment", commentId, value). */
export async function setVoteComment(
  commentId: string,
  value: VoteValue,
): Promise<ActionResult<VoteState>> {
  return setVote("comment", commentId, value);
}
