"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { joinCommunity, leaveCommunity } from "@/lib/actions/communities";
import { extractErrorCode } from "@/lib/errors";
import { pesanGagalHasil } from "@/components/feed/types";

/**
 * Tombol Gabung/Keluar komunitas (PRD 18.2.2): berubah langsung tanpa reload
 * (optimistic), disimpan lewat aksi joinCommunity/leaveCommunity; dikembalikan
 * bila server menolak. Tamu diarahkan ke /login.
 */

export interface JoinButtonProps {
  slug: string;
  initialJoined: boolean;
  isLoggedIn: boolean;
}

export default function JoinButton({
  slug,
  initialJoined,
  isLoggedIn,
}: JoinButtonProps) {
  const router = useRouter();
  const [gabung, setGabung] = useState(initialJoined);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (proses) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    const sebelumnya = gabung;
    setGabung(!sebelumnya); // Optimistic: berubah langsung tanpa reload.
    setProses(true);
    setError(null);

    try {
      const hasil: unknown = sebelumnya
        ? await leaveCommunity(slug)
        : await joinCommunity(slug);
      const gagal = pesanGagalHasil(hasil);
      if (gagal) {
        setGabung(sebelumnya);
        setError(gagal);
      }
    } catch (err) {
      setGabung(sebelumnya);
      setError(extractErrorCode(err).message);
    } finally {
      setProses(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={gabung ? "secondary" : "primary"}
        onClick={toggle}
        loading={proses}
        disabled={proses}
        aria-pressed={gabung}
      >
        {gabung ? "Keluar" : "Gabung"}
      </Button>
      {error && (
        <p role="alert" className="max-w-40 text-right text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
