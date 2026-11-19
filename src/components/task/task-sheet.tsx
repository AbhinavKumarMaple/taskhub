"use client";

import { Maximize2, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTaskDetailAction } from "@/server/actions/task-actions";
import type { TaskDetailData } from "@/server/actions/task-detail-data";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { taskHref, withParams } from "@/lib/nav";
import { TaskDetail } from "./task-detail";
import { confirmDiscard, UnsavedProvider, useUnsavedRegistry } from "./unsaved";

export type TaskSheetProps = {
  /** The task to show. Falls back to the `?task=` param; empty = closed. */
  taskRef?: string | null;
  /** Defaults to removing `?task=` from the URL. */
  onClose?: () => void;
};

type Loaded = { ref: string; data?: TaskDetailData; error?: string; stamp: number };

/**
 * Right-hand task sheet driven by `?task=T-12`. Must render inside a Suspense boundary (reads search params).
 * Links inside it (subtasks, dependencies, parent) switch `?task=` in place.
 */
export function TaskSheet({ taskRef, onClose }: TaskSheetProps) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ref = (taskRef ?? sp.get("task") ?? "").trim().toUpperCase();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    getTaskDetailAction(ref).then((r) => {
      if (cancelled) return;
      setLoaded(r.ok ? { ref, data: r.data, stamp: Date.now() } : { ref, error: r.error, stamp: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  const close = onClose ?? (() => router.replace(withParams(sp, { task: null }, pathname), { scroll: false }));
  // Esc, the backdrop and the close button ask first when a text box holds unsaved typing.
  const unsaved = useUnsavedRegistry();
  const guardedClose = () => {
    if (confirmDiscard(unsaved, ref)) close();
  };
  const current = loaded && loaded.ref === ref ? loaded : null;

  return (
    <Sheet
      open={!!ref}
      onClose={guardedClose}
      title={<span className="font-mono">{ref}</span>}
      actions={
        ref && (
          <Link href={taskHref(ref, sp.get("space"))} className={buttonClass("ghost", "sm", undefined, true)} aria-label="Open full page" title="Open full page">
            <Maximize2 className="size-3.5" />
          </Link>
        )
      }
    >
      {!current ? (
        <SheetSkeleton />
      ) : current.data ? (
        <UnsavedProvider registry={unsaved}>
          <TaskDetail key={`${current.ref}-${current.stamp}`} data={current.data} mode="sheet" onDeleted={close} />
        </UnsavedProvider>
      ) : (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={`${ref} not found`}
          description={current.error ?? "It may have been deleted, or it belongs to a Space you can't see."}
          action={
            <button type="button" onClick={close} className={buttonClass("secondary", "sm")}>
              Close
            </button>
          }
        />
      )}
    </Sheet>
  );
}

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading task">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-7 w-3/4" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
