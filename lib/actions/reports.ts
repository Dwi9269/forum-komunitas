"use server";

/**
 * Server action laporan konten — PRD bagian 4.6 (Mod), 16.6 (trigger
 * after_report_insert: auto-hide pada laporan ke-3 dari akun berbeda),
 * 18.6 (kriteria selesai), 20 (kasus tepi 9), 24 (baris report).
 *
 * Aturan yang dijaga file ini:
 * - Insert HANYA kolom yang diberi grant DB (reporter_id, target_type,
 *   target_id, reason, note) — kolom status dibiarkan default 'open'
 *   (PENGUATAN migrasi 0003; klien tidak bisa mengisi status).
 * - Satu akun hanya bisa melaporkan satu item satu kali (PRD 18.6.2):
 *   unique (reporter_id, target_type, target_id) di DB + pra-cek di app
 *   agar pesan "Kamu sudah melaporkan ini" (REPORT_DUPLICATE) tampil cepat.
 * - Penulis anonim tetap bisa dilaporkan; moderator melihat penulis asli,
 *   publik tidak (PRD 20 kasus tepi 9) — tidak ada pengecualian di sini.
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

export type ReportTargetType = "post" | "comment";

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  /** Salah satu dari REPORT_REASONS (CHECK kolom reports.reason, PRD 4.6). */
  reason: string;
  /** Catatan opsional dari pelapor (PRD 18.6.1). */
  note?: string;
}

/**
 * Daftar alasan yang diterima kolom reports.reason (PRD 4.6 / skema 0001).
 * TIDAK diekspor — file "use server" hanya boleh mengekspor fungsi async;
 * FE menyalin daftar ini untuk pilihan dialog (nilai sama dengan PRD 4.6).
 */
const REPORT_REASONS = [
  "spam",
  "porn",
  "violence_sara",
  "doxxing",
  "other",
] as const;

type ReportReason = (typeof REPORT_REASONS)[number];

/** Catatan laporan dipangkas agar payload wajar (skema tidak membatasi). */
const NOTE_MAX = 1000;

/** Bentuk gagal standar { ok:false, code, message }. */
function failure(err: AppError): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code: err.code, message: err.message };
}

/** UUID v4-ish apa pun bentuknya (target_id bertipe uuid di DB). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Aksi: lapor post/komentar (PRD 24 report; PRD 4.6, 18.6)
// ============================================================

export async function report(input: ReportInput): Promise<ActionResult<null>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return failure(appError("LOGIN_REQUIRED"));
    }

    // Validasi cepat (PRD 21): tipe target, id, dan alasan harus dikenal.
    const targetType = input.targetType;
    if (targetType !== "post" && targetType !== "comment") {
      return failure(appError("REPORT_INVALID"));
    }
    const targetId = input.targetId?.trim() ?? "";
    if (!UUID_PATTERN.test(targetId)) {
      return failure(appError("REPORT_INVALID"));
    }
    const reason = (input.reason ?? "").trim();
    if (!REPORT_REASONS.includes(reason as ReportReason)) {
      return failure(appError("REPORT_INVALID"));
    }
    const note = (input.note ?? "").trim();
    const noteValue = note === "" ? null : note.slice(0, NOTE_MAX);

    const supabase = await createClient();

    // Pra-cek duplikasi (PRD 18.6.2) — unique DB tetap penjaga terakhir.
    const { data: existing, error: dupError } = await supabase
      .from("reports")
      .select("id")
      .eq("reporter_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();
    if (dupError) {
      return failure(extractErrorCode(dupError));
    }
    if (existing) {
      return failure(appError("REPORT_DUPLICATE"));
    }

    // Grant kolom DB hanya (reporter_id, target_type, target_id, reason, note);
    // status 'open' diisi default DB. RLS reports_insert menuntut pelapor
    // adalah user aktif (akun suspended/banned → RLS_DENIED, PRD 20).
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      note: noteValue,
    });
    if (error) {
      // Balapan dua klik/dua tab: unique violation 23505 → laporan ganda.
      const e = error as { code?: string; message?: string };
      if (
        e?.code === "23505" ||
        (e?.message ?? "").toLowerCase().includes("duplicate key")
      ) {
        return failure(appError("REPORT_DUPLICATE"));
      }
      return failure(extractErrorCode(error));
    }

    // Trigger after_report_insert menyembunyikan konten otomatis pada
    // laporan ke-3 dari akun berbeda (PRD 4.6/16.6) — tidak perlu di sini.
    return { ok: true, data: null };
  } catch (e) {
    return failure(extractErrorCode(e));
  }
}
