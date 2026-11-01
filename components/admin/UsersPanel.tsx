"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { RoleBadge, UserStatusBadge } from "@/components/admin/StatusBadge";
import { formatTanggal } from "@/components/admin/format";
import { pesanGagalHasil } from "@/components/feed/types";
import { extractErrorCode } from "@/lib/errors";
import { modApplyAction, type AdminUserItem } from "@/lib/actions/admin";

/**
 * Daftar pengguna + aksi moderasi akun (PRD 4.6, 18.6.5-6).
 *
 * Semua aksi lewat modApplyAction dengan targetType "user" (RPC
 * mod_apply_action → tercatat di mod_actions): suspend (pilih 1/3/7/30 hari),
 * blokir (ban), dan reaktivasi (restore). SETIAP aksi melewati dialog
 * konfirmasi. Moderator tidak bisa menindak admin (PRD 18.6.6) — tombol
 * disembunyikan untuk target admin (kecuali penonton admin sendiri) dan
 * server tetap menolak sebagai lapis kedua.
 */

const OPSI_HARI = [1, 3, 7, 30]; // PRD 18.6.5: suspend pilih 1/3/7/30 hari

interface AksiTunda {
  judul: string;
  deskripsi?: string;
  label: string;
  danger: boolean;
  jalankan: () => void;
}

export default function UsersPanel({
  users,
  viewerId,
  viewerRole,
}: {
  users: AdminUserItem[];
  viewerId: string;
  viewerRole: "member" | "moderator" | "admin";
}) {
  const router = useRouter();
  const [sedang, setSedang] = useState<string | null>(null);
  const [pesan, setPesan] = useState<
    { jenis: "ok" | "galat"; teks: string } | null
  >(null);
  const [tunda, setTunda] = useState<AksiTunda | null>(null);
  const [hari, setHari] = useState(3);

  function jalankanAksi(
    kunci: string,
    aksi: () => Promise<unknown>,
    teksSukses: string,
  ) {
    if (sedang) return;
    setPesan(null);
    setSedang(kunci);
    (async () => {
      try {
        const hasil = await aksi();
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setPesan({ jenis: "galat", teks: gagal });
        } else {
          setPesan({ jenis: "ok", teks: teksSukses });
          router.refresh();
        }
      } catch (err) {
        setPesan({ jenis: "galat", teks: extractErrorCode(err).message });
      } finally {
        setSedang(null);
      }
    })();
  }

  if (users.length === 0) {
    return (
      <EmptyState
        title="Pengguna tidak ditemukan"
        description="Coba kata kunci lain. Pencarian mencocokkan sebagian username."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pesan && (
        <div
          role={pesan.jenis === "ok" ? "status" : "alert"}
          className={`rounded-lg border px-3 py-2 text-sm ${
            pesan.jenis === "ok"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {pesan.teks}
        </div>
      )}

      {users.map((u) => {
        const kunci = `user:${u.id}`;
        const sibuk = sedang === kunci;
        const terkunci = sedang !== null;
        // PRD 18.6.6: moderator tidak bisa menindak admin (server menolak
        // FORBIDDEN). Admin boleh menindak semua. Jangan tindak diri sendiri.
        const takBisaKarenaRole = u.role === "admin" && viewerRole !== "admin";
        const diriSendiri = u.id === viewerId;
        const bisaTindak = !takBisaKarenaRole && !diriSendiri;

        return (
          <Card key={u.id} className="flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              <Avatar name={u.username || "?"} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  @{u.username || "(tanpa nama)"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={u.role} />
                  <UserStatusBadge status={u.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bergabung {formatTanggal(u.created_at) ?? "—"}
                  {u.status === "suspended" && u.suspended_until
                    ? ` · Suspend sampai ${formatTanggal(u.suspended_until) ?? "—"}`
                    : ""}
                </p>
              </div>
            </div>

            {takBisaKarenaRole ? (
              <p className="text-xs text-muted-foreground">
                Moderator tidak bisa menindak admin (PRD 18.6.6).
              </p>
            ) : diriSendiri ? (
              <p className="text-xs text-muted-foreground">
                Ini akunmu sendiri — tidak bisa ditindak dari sini.
              </p>
            ) : u.status === "active" ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Lama suspend untuk @${u.username} (hari)`}
                  value={hari}
                  disabled={terkunci}
                  onChange={(e) => setHari(Number(e.target.value))}
                  className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {OPSI_HARI.map((n) => (
                    <option key={n} value={n}>
                      {n} hari
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={sibuk}
                  disabled={terkunci && !sibuk}
                  onClick={() =>
                    setTunda({
                      judul: `Suspend @${u.username}?`,
                      deskripsi: `Akun tidak bisa login selama ${hari} hari (sampai masa sanksi berakhir).`,
                      label: `Ya, suspend ${hari} hari`,
                      danger: false,
                      jalankan: () =>
                        jalankanAksi(
                          kunci,
                          () =>
                            modApplyAction({
                              action: "suspend",
                              targetType: "user",
                              targetId: u.id,
                              reason: `Suspend ${hari} hari via dashboard admin`,
                              days: hari,
                            }),
                          `@${u.username} disuspend ${hari} hari.`,
                        ),
                    })
                  }
                >
                  Suspend
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={sibuk}
                  disabled={terkunci && !sibuk}
                  onClick={() =>
                    setTunda({
                      judul: `Blokir @${u.username}?`,
                      deskripsi:
                        "Akun tidak akan bisa login lagi. Tindakan tercatat di log moderasi.",
                      label: "Ya, blokir",
                      danger: true,
                      jalankan: () =>
                        jalankanAksi(
                          kunci,
                          () =>
                            modApplyAction({
                              action: "ban",
                              targetType: "user",
                              targetId: u.id,
                              reason: "Blokir via dashboard admin",
                            }),
                          `@${u.username} diblokir.`,
                        ),
                    })
                  }
                >
                  Blokir
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={sibuk}
                  disabled={terkunci && !sibuk}
                  onClick={() =>
                    setTunda({
                      judul: `Reaktivasi @${u.username}?`,
                      deskripsi:
                        "Status akun kembali aktif dan masa sanksi dihapus.",
                      label: "Ya, reaktivasi",
                      danger: false,
                      jalankan: () =>
                        jalankanAksi(
                          kunci,
                          () =>
                            modApplyAction({
                              action: "restore",
                              targetType: "user",
                              targetId: u.id,
                              reason: "Reaktivasi via dashboard admin",
                            }),
                          `@${u.username} direaktivasi.`,
                        ),
                    })
                  }
                >
                  Reaktivasi
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmDialog
        open={tunda !== null}
        title={tunda?.judul ?? ""}
        description={tunda?.deskripsi}
        confirmLabel={tunda?.label}
        danger={tunda?.danger ?? false}
        loading={sedang !== null}
        onCancel={() => {
          if (sedang === null) setTunda(null);
        }}
        onConfirm={() => {
          const aksi = tunda;
          setTunda(null);
          aksi?.jalankan();
        }}
      />
    </div>
  );
}
