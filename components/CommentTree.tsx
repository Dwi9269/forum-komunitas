"use client";

import { useState } from "react";
import CommentForm from "@/components/CommentForm";
import { waktuRelatif, type CommentView } from "@/components/feed/types";

/**
 * Pohon komentar bertingkat (PRD 4.4, wireframe PRD 22.2):
 * - Kedalaman maksimum 3; tombol "Balas" disembunyikan pada kedalaman 3
 *   (PRD 18.4.2).
 * - Balasan diberi indentasi + garis vertikal tipis; kedalaman di atas 3
 *   tidak menambah indentasi lagi di layar sempit (catatan wireframe 22.2).
 * - Komentar dihapus/tersembunyi tampil abu-abu "[komentar dihapus]" tanpa
 *   nama/isi, tetapi balasan di bawahnya tetap terlihat (PRD 18.4.3).
 * - Semua teks dirender sebagai teks biasa — TANPA dangerouslySetInnerHTML.
 */

const KEDALAMAN_MAKS = 3;

export interface CommentTreeProps {
  postId: string;
  comments: CommentView[];
  /** false → tombol Balas disembunyikan (tamu / akun disuspend). */
  isLoggedIn: boolean;
}

function ItemKomentar({
  postId,
  node,
  depth,
  isLoggedIn,
}: {
  postId: string;
  node: CommentView;
  depth: number;
  isLoggedIn: boolean;
}) {
  const [membalas, setMembalas] = useState(false);
  const bolehMembalas = isLoggedIn && depth < KEDALAMAN_MAKS && !node.isRemoved;
  const indentAnak = depth < KEDALAMAN_MAKS;
  const anak = node.children ?? [];

  return (
    <li className="py-2">
      {node.isRemoved ? (
        <p className="text-sm italic text-muted-foreground">[komentar dihapus]</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {node.authorName ?? "Anonim"}
            </span>
            <time suppressHydrationWarning dateTime={node.createdAt ?? undefined}>
              {waktuRelatif(node.createdAt)}
            </time>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {node.body}
          </p>
          {bolehMembalas && (
            <button
              type="button"
              onClick={() => setMembalas((v) => !v)}
              aria-expanded={membalas}
              className="mt-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {membalas ? "Tutup" : "Balas"}
            </button>
          )}
        </>
      )}

      {membalas && bolehMembalas && (
        <CommentForm
          postId={postId}
          parentId={node.id}
          autoFocus
          compact
          onSelesai={() => setMembalas(false)}
          placeholder={`Balas ${node.authorName ?? "komentar ini"}...`}
        />
      )}

      {anak.length > 0 && (
        <ul
          className={
            indentAnak ? "ml-3 mt-1 border-l-2 border-border pl-3" : "mt-1"
          }
        >
          {anak.map((anakNode, indeks) => (
            <ItemKomentar
              key={anakNode.id || `k-${depth}-${indeks}`}
              postId={postId}
              node={anakNode}
              depth={depth + 1}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CommentTree({
  postId,
  comments,
  isLoggedIn,
}: CommentTreeProps) {
  if (comments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        Belum ada komentar. Jadilah yang pertama berkomentar!
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {comments.map((node, indeks) => (
        <ItemKomentar
          key={node.id || `k-1-${indeks}`}
          postId={postId}
          node={node}
          depth={1}
          isLoggedIn={isLoggedIn}
        />
      ))}
    </ul>
  );
}
