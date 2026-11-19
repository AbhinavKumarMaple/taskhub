import { Skeleton } from "@/components/ui/misc";

/** Board loading state: filter bar + three columns of still, breathing cards. */
export function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading board">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      <div className="grid grid-cols-[repeat(3,minmax(260px,1fr))] gap-3 overflow-hidden">
        {[4, 3, 2].map((n, c) => (
          <div key={c} className="flex flex-col gap-2 rounded-lg bg-surface-2/60 p-2">
            <Skeleton className="h-6 w-28 bg-surface-3" />
            {Array.from({ length: n }, (_, i) => (
              <Skeleton key={i} className="h-24 bg-surface" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
