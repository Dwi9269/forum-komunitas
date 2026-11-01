"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import { pesanGagalHasil } from "@/components/feed/types";
import { extractErrorCode } from "@/lib/errors";
import {
  createCommunity,
  updateCommunity,
  type AdminCommunityItem,
} from "@/lib/actions/admin";

/**
 * Komunitas dashboard admin (PRD 4.2, 18.6): daftar + buat komunitas baru +
 * edit deskripsi. createCommunity/updateCommunity hanya untuk ADMIN (RLS
 * comm_admin) — moderator melihat daftar saja dengan catatan.
 * Validasi slug mengikuti kontrak backend: ^[a-z0-9-]{2,30}$.
 */

const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/;
const NAMA_MAKS = 80;
const DESKRIPSI_MAKS = 300; // batas UI wajar (backend tidak membatasi)

export default function CommunitiesPanel({
  communities,
  viewerRole,
}: {
  communities: AdminCommunityItem[];
  viewerRole: "member" | "moderator" | "admin";
}) {
  const router = useRouter();
  const adminPenuh = viewerRole === "admin";

  // Form buat
  const [slug, setSlug] = useState("");
  const [nama, setNama] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [membuat, setMembuat] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  // Edit deskripsi
  const [editId, setEditId] = useState<string | null>(null);
  const [editTeks, setEditTeks] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatEdit, setGalatEdit] = useState<string | null>(null);

  function buat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminPenuh || membuat) return;

    const slugBersih = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slugBersih)) {
      setGalatForm(
        "Slug 2–30 karakter: huruf kecil, angka, atau tanda hubung (mis. teh-dan-kopi).",
      );
      return;
    }
    const namaBersih = nama.trim();
    if (!namaBersih || [...namaBersih].length > NAMA_MAKS) {
      setGalatForm(`Nama komunitas wajib diisi, maksimal ${NAMA_MAKS} karakter.`);
      return;
    }

    setGalatForm(null);
    setMembuat(true);
    (async () => {
      try {
        const hasil = await createCommunity({
          slug: slugBersih,
          name: namaBersih,
          description: deskripsi.trim() ? deskripsi.trim() : undefined,
        });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setGalatForm(gagal);
        } else {
          setSlug("");
          setNama("");
          setDeskripsi("");
          setPesan(`Komunitas c/${slugBersih} berhasil dibuat.`);
          router.refresh();
        }
      } catch (err) {
        setGalatForm(extractErrorCode(err).message);
      } finally {
        setMembuat(false);
      }
    })();
  }

  function simpanDeskripsi(id: string) {
    if (menyimpan) return;
    setGalatEdit(null);
    setMenyimpan(true);
    (async () => {
      try {
        const hasil = await updateCommunity({
          id,
          description: editTeks.trim(),
        });
        const gagal = pesanGagalHasil(hasil);
        if (gagal) {
          setGalatEdit(gagal);
        } else {
          setEditId(null);
          setPesan("Deskripsi komunitas diperbarui.");
          router.refresh();
        }
      } catch (err) {
        setGalatEdit(extractErrorCode(err).message);
      } finally {
        setMenyimpan(false);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      {pesan && (
        <div
          role="status"
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
        >
          {pesan}
        </div>
      )}

      {!adminPenuh && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Membuat dan mengubah komunitas hanya untuk admin. Kamu masih bisa
          melihat daftar.
        </div>
      )}

      {adminPenuh && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Buat komunitas baru
          </h2>
          {galatForm && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {galatForm}
            </div>
          )}
          <form onSubmit={buat} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                name="slug"
                label="Slug"
                placeholder="teh-dan-kopi"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={membuat}
                maxLength={30}
              />
              <Input
                name="nama"
                label="Nama"
                placeholder="Teh dan Kopi"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                disabled={membuat}
                maxLength={NAMA_MAKS}
              />
            </div>
            <Textarea
              name="deskripsi"
              label="Deskripsi"
              placeholder="Apa yang dibahas di komunitas ini?"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              disabled={membuat}
              maxLength={DESKRIPSI_MAKS}
              className="min-h-20"
            />
            <div className="flex justify-end">
              <Button type="submit" loading={membuat} disabled={membuat}>
                Buat komunitas
              </Button>
            </div>
          </form>
        </Card>
      )}

      {communities.length === 0 ? (
        <EmptyState
          title="Belum ada komunitas"
          description="Buat komunitas pertama agar pengguna bisa mulai berbagi."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {communities.map((k) => (
            <Card key={k.id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{k.name}</p>
                <span className="text-sm text-muted-foreground">
                  c/{k.slug}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {k.member_count === null
                    ? ""
                    : `${k.member_count} anggota`}
                  {k.member_count !== null && k.post_count !== null ? " · " : ""}
                  {k.post_count === null ? "" : `${k.post_count} post`}
                </span>
              </div>

              {editId === k.id ? (
                <div className="mt-1 flex flex-col gap-2">
                  {galatEdit && (
                    <div
                      role="alert"
                      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      {galatEdit}
                    </div>
                  )}
                  <Textarea
                    name={`deskripsi-${k.id}`}
                    label="Deskripsi"
                    value={editTeks}
                    onChange={(e) => setEditTeks(e.target.value)}
                    disabled={menyimpan}
                    maxLength={DESKRIPSI_MAKS}
                    className="min-h-20"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditId(null);
                        setGalatEdit(null);
                      }}
                      disabled={menyimpan}
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      loading={menyimpan}
                      disabled={menyimpan}
                      onClick={() => simpanDeskripsi(k.id)}
                    >
                      Simpan
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {k.description || "(tanpa deskripsi)"}
                  </p>
                  {adminPenuh && (
                    <div className="mt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditId(k.id);
                          setEditTeks(k.description ?? "");
                          setGalatEdit(null);
                        }}
                      >
                        Edit deskripsi
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
