import { Skeleton } from "@/components/ui/misc";

export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="mt-2 h-8" />
      <div className="mt-3 flex flex-col gap-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    </div>
  );
}

/** Default page loading state. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
