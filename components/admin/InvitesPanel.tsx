"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { formatTanggal } from "@/components/admin/format";
import { pesanGagalHasil } from "@/components/feed/types";
import { extractErrorCode } from "@/lib/errors";
import { createInvite, type InviteItem } from "@/lib/actions/admin";

/**
 * Kode undangan dashboard admin (PRD 4.1 akses via undangan; 24 createInvite).
 *
 * - Daftar: kode, dipakai/max, kedaluwarsa, dibuat oleh.
 * - Form buat kode: jumlah pakai maks (1–1000) + tanggal kedaluwarsa opsional
 *   (diambil pukul 23:59 tanggal terpilih). createInvite hanya untuk ADMIN —
 *   moderator yang mencoba menerima FORBIDDEN (pesan tampil inline).
 * - Tombol salin per kode (navigator.clipboard + fallback textarea).
 */

const MAX_USES_MAKS = 1000;

export default function InvitesPanel({
  invites,
  viewerRole,
  kini,
}: {
  invites: InviteItem[];
  viewerRole: "member" | "moderator" | "admin";
  /** Timestamp server (ms) agar hitungan kedaluwarsa deterministik saat hidrasi. */
  kini: number;
}) {
  const router = useRouter();
  const adminPenuh = viewerRole === "admin";

  const [maxUses, setMaxUses] = useState("10");
  const [kedaluwarsa, setKedaluwarsa] = useState("");
  const [membuat, setMembuat] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [kodeBaru, setKodeBaru] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  async function salinKode(kode: string) {
    try {
      await navigator.clipboard.writeText(kode);
    } catch {
      // Fallback untuk browser tanpa clipboard API (mis. tanpa HTTPS).
      const el = document.createElement("textarea");
      el.value = kode;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        // Biarkan tombol tetap "Salin" bila gagal total.
        document.body.removeChild(el);
        return;
      }
      document.body.removeChild(el);
    }
    setTersalin(kode);
    setTimeout(() => {
      setTersalin((kini2) => (kini2 === kode ? null : kini2));
    }, 2000);
  }

  function buat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminPenuh || membuat) return;

    const jumlah = Number(maxUses);
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > MAX_USES_MAKS) {
      setGalatForm(`Jumlah pakai maks harus angka bulat 1–${MAX_USES_MAKS}.`);
      return;
    }
    let expiresAt: string | undefined;
    if (kedaluwarsa) {
      const parsed = new Date(`${kedaluwarsa}T23:59:59`);
      if (Number.isNaN(parsed.getTime())) {
        setGalatForm("Tanggal kedaluwarsa tidak valid.");
        return;
      }
      expiresAt = parsed.toISOString();
    }

    setGalatForm(null);
    setMembuat(true);
    (async () => {
      try {
        const hasil = await createInvite({ maxUses: jumlah, expiresAt });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setGalatForm(gagal);
        } else if (hasil.ok) {
          setKodeBaru(hasil.data.code);
          setMaxUses("10");
          setKedaluwarsa("");
          router.refresh();
        }
      } catch (err) {
        setGalatForm(extractErrorCode(err).message);
      } finally {
        setMembuat(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      {!adminPenuh && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Membuat kode undangan hanya untuk admin. Kamu masih bisa melihat dan
          menyalin kode yang ada.
        </div>
      )}

      {adminPenuh && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Buat kode undangan
          </h2>
          {galatForm && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {galatForm}
            </div>
          )}
          {kodeBaru && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm"
            >
              <span className="text-foreground">Kode baru:</span>
              <code className="rounded bg-card px-2 py-0.5 font-mono text-base font-bold tracking-widest text-foreground">
                {kodeBaru}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => salinKode(kodeBaru)}
              >
                {tersalin === kodeBaru ? "Tersalin!" : "Salin"}
              </Button>
            </div>
          )}
          <form onSubmit={buat} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                type="number"
                name="max_uses"
                label="Jumlah pakai maks"
                min={1}
                max={MAX_USES_MAKS}
                step={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                disabled={membuat}
                placeholder="10"
              />
              <Input
                type="date"
                name="expires_at"
                label="Kedaluwarsa (opsional)"
                value={kedaluwarsa}
                onChange={(e) => setKedaluwarsa(e.target.value)}
                disabled={membuat}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={membuat} disabled={membuat}>
                Buat kode
              </Button>
            </div>
          </form>
        </Card>
      )}

      {invites.length === 0 ? (
        <EmptyState
          title="Belum ada kode undangan"
          description="Buat kode undangan agar orang baru bisa mendaftar."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {invites.map((invite) => {
            const kedaluwarsaPada = invite.expires_at
              ? new Date(invite.expires_at).getTime()
              : null;
            const habis = invite.used_count >= invite.max_uses;
            const lewat = kedaluwarsaPada !== null && kedaluwarsaPada < kini;
            const mati = habis || lewat;

            return (
              <Card key={invite.code} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="select-all rounded bg-muted px-2 py-1 font-mono text-base font-bold tracking-widest text-foreground">
                    {invite.code}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => salinKode(invite.code)}
                  >
                    {tersalin === invite.code ? "Tersalin!" : "Salin"}
                  </Button>
                  <span className="ml-auto">
                    {lewat ? (
                      <Badge variant="danger">Kedaluwarsa</Badge>
                    ) : habis ? (
                      <Badge variant="neutral">Habis</Badge>
                    ) : (
                      <Badge variant="success">Aktif</Badge>
                    )}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Dipakai{" "}
                  <span className="font-medium text-foreground">
                    {invite.used_count}/{invite.max_uses}
                  </span>
                  {invite.expires_at
                    ? ` · Berlaku s.d. ${formatTanggal(invite.expires_at) ?? "—"}`
                    : " · Tanpa kedaluwarsa"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Dibuat oleh{" "}
                  {invite.created_by_username
                    ? `@${invite.created_by_username}`
                    : "(tidak diketahui)"}{" "}
                  · {formatTanggal(invite.created_at) ?? "—"}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
