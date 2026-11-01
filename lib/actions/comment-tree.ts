/**
 * Helper murni menyusun komentar flat dari `comments_view` menjadi pohon
 * (PRD 24 getComments: "lalu susun pohon di klien"). Komentar terhapus/
 * disembunyikan tetap ikut di pohon (is_removed = true, body/penulis null)
 * agar balasan di bawahnya tetap terlihat (PRD 18.4.3).
 *
 * File ini TIDAK memakai "use server" — boleh diimpor dari Server maupun
 * Client Components.
 */

import type { CommentItem } from "./posts";

/** Node pohon komentar: komentar + semua balasan langsung di bawahnya. */
export interface CommentNode extends CommentItem {
  replies: CommentNode[];
}

/**
 * Urutan per tingkat (PRD 18.4.5): skor tertinggi dahulu, lalu waktu
 * terlama (paling tua lebih dulu). created_at berformat ISO 8601 dari
 * Postgres sehingga bisa dibandingkan sebagai string.
 */
function byRank(a: CommentNode, b: CommentNode): number {
  return b.score - a.score || a.created_at.localeCompare(b.created_at);
}

/**
 * Susun pohon dari daftar flat. Balasan yang induknya tidak ada di daftar
 * (sudah dihapus di DB, atau respons terpotong) naik ke akar agar tidak
 * hilang. Siklus (data rusak) dibiarkan terpisah dari akar, tidak pernah
 * loop — tiap node hanya dilekatkan satu kali.
 */
export function buildCommentTree(comments: CommentItem[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent && parent !== node) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    if (node.replies.length > 1) {
      node.replies.sort(byRank);
    }
  }
  roots.sort(byRank);
  return roots;
}
