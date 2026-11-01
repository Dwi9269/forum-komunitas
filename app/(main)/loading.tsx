import FeedSkeleton from "@/components/feed/FeedSkeleton";

/** Skeleton daftar post saat navigasi antarhalaman (PRD 22.5). */
export default function Loading() {
  return <FeedSkeleton jumlah={5} />;
}
