import { PageSkeleton } from "@/components/shell/skeletons";

/** Suspense boundary for this segment, so client navigations into it render at once. */
export default function Loading() {
  return <PageSkeleton />;
}
