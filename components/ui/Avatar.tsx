export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  /** Nama pengguna: sumber inisial (bila tanpa gambar), warna latar deterministik, dan teks alt. */
  name: string;
  /** URL foto profil. Bila kosong/null, tampilkan inisial. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = (parts.shift() ?? "").charAt(0);
  const last = parts.length > 0 ? (parts.pop() ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Hue deterministik dari nama agar warna latar stabil antar-render (aman untuk SSR/hidrasi). */
function hueFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

/** Avatar pengguna; tanpa gambar menampilkan inisial dari `name`. */
export default function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: AvatarProps) {
  if (src) {
    // <img> sengaja dipakai di Fase 1 (tanpa konfigurasi domain gambar);
    // ganti ke next/image saat domain CDN gambar sudah ditetapkan.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${sizeClasses[size]} ${className}`}
      />
    );
  }

  const hue = hueFromName(name || "?");
  return (
    <span
      role="img"
      aria-label={name}
      style={{ backgroundColor: `hsl(${hue} 45% 38%)` }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
