import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Upload video via server action (kompres klien ≤ 5 MB + fallback asli ≤ 8 MB)
  // butuh batas body lebih besar dari default 1 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
