"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import {
  ReportStatusBadge,
  TargetTypeBadge,
} from "@/components/admin/StatusBadge";
import { labelAlasan } from "@/components/admin/format";
import { pesanGagalHasil, waktuRelatif } from "@/components/feed/types";
import { extractErrorCode } from "@/lib/errors";
import {
  modApplyAction,
  modDismissReports,
  type ReportItem,
} from "@/lib/actions/admin";

/**
 * Antrean laporan dashboard admin (PRD 4.6, 18.6.4-5, wireframe 22.4).
 *
 * - Laporan dengan target sama dikelompokkan jadi satu kartu ("dilaporkan Nx",
 *   daftar alasan, daftar pelapor) — antrean diurutkan server dari yang paling
 *   banyak dilaporkan.
 * - Thumbnail gambar DIBURAMKAN (CSS blur) sampai moderator klik, untuk
 *   melindungi moderator dari konten mengganggu (PRD 22.4).
 * - Aksi konten via modApplyAction (RPC mod_apply_action, PRD 16.6), tolak
 *   laporan via modDismissReports. Setelah sukses router.refresh() memuat ulang
 *   data server (laporan open otomatis resolved oleh RPC → baris hilang).
 * - Aksi penulis (suspend 1/3/7/30 hari, blokir) hanya untuk post/komentar
 *   yang penulisnya masih terbaca. Moderator menindak admin ditolak server
 *   (FORBIDDEN, PRD 18.6.6) → pesan error tampil inline.
 */

export type StatusAntrean = "open" | "resolved" | "dismissed";

interface GrupLaporan {
  key: string;
  targetType: "post" | "comment";
  targetId: string;
  /** Baris representatif (server sudah urut paling banyak dilaporkan). */
  item: ReportItem;
  count: number;
  reasons: string[];
  reporters: string[];
}

type Aksi = "hide" | "delete" | "restore" | "dismiss" | "suspend" | "ban";

interface AksiTunda {
  judul: string;
  deskripsi?: string;
  label: string;
  danger: boolean;
  jalankan: () => void;
}

const OPSI_HARI = [1, 3, 7, 30]; // PRD 18.6.5: suspend pilih 1/3/7/30 hari

export default function ReportsQueue({
  reports,
  status,
}: {
  reports: ReportItem[];
  status: StatusAntrean;
}) {
  const router = useRouter();
  const [sedang, setSedang] = useState<string | null>(null);
  const [pesan, setPesan] = useState<
    { jenis: "ok" | "galat"; teks: string } | null
  >(null);
  const [tunda, setTunda] = useState<AksiTunda | null>(null);
  const [hariPerTarget, setHariPerTarget] = useState<Record<string, number>>({});

  // Kelompokkan laporan per target (post/komentar yang sama = satu kartu).
  const grup = useMemo<GrupLaporan[]>(() => {
    const peta = new Map<string, GrupLaporan>();
    const daftar: GrupLaporan[] = [];
    for (const item of reports) {
      if (item.target_type !== "post" && item.target_type !== "comment") {
        continue;
      }
      const key = `${item.target_type}:${item.target_id}`;
      let g = peta.get(key);
      if (!g) {
        g = {
          key,
          targetType: item.target_type,
          targetId: item.target_id,
          item,
          count: item.report_count || 1,
          reasons: [],
          reporters: [],
        };
        peta.set(key, g);
        daftar.push(g);
      }
      if (g.count < item.report_count) g.count = item.report_count;
      const label = labelAlasan(item.reason);
      if (!g.reasons.includes(label)) g.reasons.push(label);
      const pelapor = item.reporter_username
        ? `@${item.reporter_username}`
        : "(akun tidak terbaca)";
      if (!g.reporters.includes(pelapor)) g.reporters.push(pelapor);
    }
    return daftar;
  }, [reports]);

  function jalankanAksi(
    kunci: string,
    aksi: () => Promise<unknown>,
    teksSukses: string,
  ) {
    if (sedang) return; // satu aksi pada satu waktu
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

  if (grup.length === 0) {
    return (
      <EmptyState
        title={
          status === "open"
            ? "Tidak ada laporan terbuka"
            : status === "resolved"
              ? "Belum ada laporan selesai"
              : "Belum ada laporan yang ditolak"
        }
        description={
          status === "open"
            ? "Semua laporan sudah ditinjau. Laporan baru dari pengguna akan muncul di sini."
            : "Ubah filter status di atas untuk melihat laporan lain."
        }
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

      {grup.map((g) => {
        const snippet = g.item.target_snippet;
        const isPost = g.targetType === "post";
        const tersembunyi = isPost
          ? snippet?.kind === "post" && snippet.is_hidden
          : snippet?.kind === "comment" && snippet.is_removed;
        const terhapus = isPost
          ? snippet?.kind === "post" && snippet.is_deleted
          : false;
        const penulisId = snippet?.author_id ?? null;
        const penulisNama = snippet?.author_username ?? null;
        const alasanGabung = g.reasons.join(", ");
        const hari = hariPerTarget[g.key] ?? 3;
        const kunci = (a: Aksi) => `${g.key}:${a}`;
        const sibuk = (a: Aksi) => sedang === kunci(a);
        const terkunci = sedang !== null;

        return (
          <Card key={g.key} className="flex flex-col gap-2.5">
            {/* Baris kepala: tipe target, jumlah laporan, status, waktu */}
            <div className="flex flex-wrap items-center gap-2">
              <TargetTypeBadge type={g.targetType} />
              <Badge variant="warning">dilaporkan {g.count}x</Badge>
              <ReportStatusBadge status={g.item.status} />
              <span className="ml-auto text-xs text-muted-foreground">
                {waktuRelatif(g.item.created_at)}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Alasan: <span className="text-foreground">{alasanGabung}</span>
              {" · "}Dilaporkan oleh{" "}
              <span className="text-foreground">
                {g.reporters.slice(0, 2).join(", ")}
                {g.reporters.length > 2
                  ? ` +${g.reporters.length - 2} lain`
                  : ""}
              </span>
            </p>

            {g.item.note && (
              <blockquote className="rounded-lg border-l-2 border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
                “{g.item.note}”
              </blockquote>
            )}

            {/* Cuplikan konten target */}
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Penulis asli:{" "}
                  <span className="font-medium text-foreground">
                    {penulisNama ? `@${penulisNama}` : "(tidak terbaca)"}
                  </span>
                </span>
                {terhapus && <Badge variant="danger">Terhapus</Badge>}
                {!terhapus && tersembunyi && (
                  <Badge variant="warning">
                    {isPost ? "Tersembunyi" : "Tersembunyi/terhapus"}
                  </Badge>
                )}
              </div>

              {snippet ? (
                <>
                  {isPost && snippet.kind === "post" && snippet.title && (
                    <p className="mt-1.5 font-semibold leading-snug text-foreground">
                      {snippet.title}
                    </p>
                  )}
                  {snippet.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground line-clamp-4">
                      {snippet.body}
                    </p>
                  )}
                  {snippet.kind === "post" &&
                    snippet.image_urls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {snippet.image_urls.map((url) => (
                          <ThumbBlur
                            key={url}
                            src={url}
                            alt="Foto post yang dilaporkan"
                          />
                        ))}
                      </div>
                    )}
                </>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Konten tidak ditemukan — mungkin sudah terhapus permanen.
                </p>
              )}
            </div>

            {/* Aksi konten — hanya bila target masih terbaca; target hilang
                cukup ditolak/dibiarkan (hide/delete akan gagal NOT_FOUND). */}
            {snippet ? (
              <div className="flex flex-wrap gap-2">
                {terhapus || tersembunyi ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={sibuk("restore")}
                    disabled={terkunci && !sibuk("restore")}
                    onClick={() =>
                      jalankanAksi(
                        kunci("restore"),
                        () =>
                          modApplyAction({
                            action: "restore",
                            targetType: g.targetType,
                            targetId: g.targetId,
                            reason: "Pulihkan via antrean laporan",
                          }),
                        "Konten dipulihkan.",
                      )
                    }
                  >
                    Pulihkan
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={sibuk("hide")}
                      disabled={terkunci && !sibuk("hide")}
                      onClick={() =>
                        jalankanAksi(
                          kunci("hide"),
                          () =>
                            modApplyAction({
                              action: "hide",
                              targetType: g.targetType,
                              targetId: g.targetId,
                              reason: `Sembunyikan atas laporan: ${alasanGabung}`,
                            }),
                          "Konten disembunyikan.",
                        )
                      }
                    >
                      Sembunyikan
                    </Button>
                    {isPost && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={sibuk("delete")}
                        disabled={terkunci && !sibuk("delete")}
                        onClick={() =>
                          setTunda({
                            judul: "Hapus post ini?",
                            deskripsi:
                              "Post akan dihapus dan laporan terbuka untuk post ini otomatis ditandai selesai.",
                            label: "Ya, hapus",
                            danger: true,
                            jalankan: () =>
                              jalankanAksi(
                                kunci("delete"),
                                () =>
                                  modApplyAction({
                                    action: "delete",
                                    targetType: g.targetType,
                                    targetId: g.targetId,
                                    reason: `Hapus atas laporan: ${alasanGabung}`,
                                  }),
                                "Post dihapus.",
                              ),
                          })
                        }
                      >
                        Hapus
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aksi konten tidak tersedia — target tidak ditemukan di
                database.
              </p>
            )}
            {status === "open" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={sibuk("dismiss")}
                  disabled={terkunci && !sibuk("dismiss")}
                  onClick={() =>
                    jalankanAksi(
                      kunci("dismiss"),
                      () =>
                        modDismissReports({
                          targetType: g.targetType,
                          targetId: g.targetId,
                        }),
                      "Laporan ditolak. Konten ditampilkan kembali.",
                    )
                  }
                >
                  Tolak laporan
                </Button>
              </div>
            )}

            {/* Aksi penulis (PRD 22.4: [Suspend v] [Banned]) */}
            {penulisId && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                <span className="text-xs text-muted-foreground">
                  Tindakan penulis:
                </span>
                <select
                  aria-label="Lama suspend (hari)"
                  value={hari}
                  disabled={terkunci}
                  onChange={(e) =>
                    setHariPerTarget((p) => ({
                      ...p,
                      [g.key]: Number(e.target.value),
                    }))
                  }
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
                  loading={sibuk("suspend")}
                  disabled={terkunci && !sibuk("suspend")}
                  onClick={() =>
                    jalankanAksi(
                      kunci("suspend"),
                      () =>
                        modApplyAction({
                          action: "suspend",
                          targetType: "user",
                          targetId: penulisId,
                          reason: `Suspend ${hari} hari atas laporan: ${alasanGabung}`,
                          days: hari,
                        }),
                      `Penulis disuspend ${hari} hari.`,
                    )
                  }
                >
                  Suspend penulis
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={sibuk("ban")}
                  disabled={terkunci && !sibuk("ban")}
                  onClick={() =>
                    setTunda({
                      judul: "Blokir penulis?",
                      deskripsi: penulisNama
                        ? `Akun @${penulisNama} tidak akan bisa login lagi.`
                        : "Akun tidak akan bisa login lagi.",
                      label: "Ya, blokir",
                      danger: true,
                      jalankan: () =>
                        jalankanAksi(
                          kunci("ban"),
                          () =>
                            modApplyAction({
                              action: "ban",
                              targetType: "user",
                              targetId: penulisId,
                              reason: `Blokir penulis atas laporan: ${alasanGabung}`,
                            }),
                          "Penulis diblokir.",
                        ),
                    })
                  }
                >
                  Blokir penulis
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

/**
 * Thumbnail laporan DIBURAMKAN (CSS blur, PRD 22.4) sampai moderator
 * mengklik — melindungi moderator dari konten mengganggu. Klik lagi untuk
 * memburamkan kembali (aria-pressed).
 */
function ThumbBlur({ src, alt }: { src: string; alt: string }) {
  const [lihat, setLihat] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setLihat((v) => !v)}
      aria-pressed={lihat}
      title={lihat ? "Klik untuk buramkan kembali" : "Klik untuk lihat foto"}
      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* <img> sengaja dipakai (pola sama dengan Avatar.tsx — tanpa konfigurasi domain gambar). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={lihat ? alt : ""}
        loading="lazy"
        className={`h-full w-full object-cover transition-all duration-200 ${
          lihat ? "" : "scale-110 blur-lg"
        }`}
      />
      {!lihat && (
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-black/60 to-transparent pb-1 pt-3 text-[10px] font-medium text-white">
          Klik untuk lihat
        </span>
      )}
    </button>
  );
}
