"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { LabelChip, PriorityMarker, SpaceChip, StatusChip, TypeChip, statusTone } from "@/components/ui/chip";
import { ProgressRing, RelTime } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

import { withParams } from "@/lib/nav";
import type { TaskSummary } from "@/lib/types";
import { DeployBadges } from "@/components/board/board-card";
import { PAGE_SIZE } from "./constants";

type Col = { key: string; label: string; sort?: string; className?: string };

const COLUMNS: Col[] = [
  { key: "ref", label: "Ref", sort: "ref", className: "w-20" },
  { key: "title", label: "Title", sort: "title" },
  { key: "status", label: "Status", sort: "status", className: "w-28" },
  { key: "type", label: "Type", sort: "type", className: "w-28" },
  { key: "priority", label: "Priority", sort: "priority", className: "w-16" },
  { key: "space", label: "Space", sort: "space", className: "w-28" },
  { key: "labels", label: "Labels", className: "w-24" },
  { key: "assignee", label: "Assignee", className: "w-24" },
  { key: "milestone", label: "Milestone", sort: "milestone", className: "w-28" },
  { key: "ac", label: "AC", sort: "ac", className: "w-16" },
  { key: "updated", label: "Updated", sort: "updated", className: "w-20" },
];

/** Opens a task in the URL-driven sheet (`?task=REF`), keeping every other param. */
export function useTaskSheetHref() {
  const sp = useSearchParams();
  const pathname = usePathname();
  return (ref: string) => withParams(sp, { task: ref }, pathname);
}

/** Clickable row: the ref is a real link (keyboard), the whole row also opens the sheet. */
export function TaskRow({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
        router.push(href, { scroll: false });
      }}
      className={cn("cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2/60", className)}
    >
      {children}
    </tr>
  );
}

export function RefLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="rounded-sm font-mono text-xs text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}

export function TasksTable({
  items,
  total,
  page,
  sort,
  order,
  statuses,
  environments = [],
  doneStatus,
}: {
  items: TaskSummary[];
  total: number;
  page: number;
  sort: string;
  order: "asc" | "desc";
  statuses: string[];
  environments?: string[];
  doneStatus?: string;
}) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const sheetHref = useTaskSheetHref();

  const sortHref = (key: string) => {
    const nextOrder = sort === key ? (order === "asc" ? "desc" : "asc") : key === "updated" || key === "ac" ? "desc" : "asc";
    return withParams(sp, { sort: key, order: nextOrder, page: null, task: null }, pathname);
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const pageHref = (p: number) => withParams(sp, { page: p > 1 ? p : null, task: null }, pathname);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[1100px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              {COLUMNS.map((c) => {
                const activeSort = c.sort && sort === c.sort;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={activeSort ? (order === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("h-9 px-3 font-medium", c.className)}
                  >
                    {c.sort ? (
                      <Link
                        href={sortHref(c.sort)}
                        scroll={false}
                        className={cn("inline-flex items-center gap-1 rounded-sm hover:text-fg", activeSort && "text-fg")}
                      >
                        {c.label}
                        {activeSort &&
                          (order === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <TaskRow key={t.ref} href={sheetHref(t.ref)}>
                <td className="px-3 py-2">
                  <RefLink href={sheetHref(t.ref)}>{t.ref}</RefLink>
                </td>
                <td className="px-3 py-2" title={t.title}>
                  <div className="truncate font-medium">{t.title}</div>
                  {t.statusReason && ["blocked", "cancelled"].includes(statusTone(t.status, statuses)) && (
                    <div
                      className={cn("truncate text-xs", statusTone(t.status, statuses) === "blocked" ? "text-danger-soft-fg" : "text-fg-subtle")}
                      title={`${t.status}: ${t.statusReason}`}
                    >
                      {t.statusReason}
                    </div>
                  )}
                  <DeployBadges task={t} environments={environments} doneStatus={doneStatus} className="mt-1" />
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={t.status} statuses={statuses} size="xs" />
                </td>
                <td className="px-3 py-2">
                  <TypeChip type={t.type} />
                </td>
                <td className="px-3 py-2">
                  <PriorityMarker priority={t.priority} />
                </td>
                <td className="px-3 py-2">
                  <SpaceChip space={t.space} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 overflow-hidden">
                    {t.labels.map((l) => (
                      <LabelChip key={l} label={l} />
                    ))}
                  </div>
                </td>
                <td className="truncate px-3 py-2 text-fg-muted">{t.assignees.join(", ")}</td>
                <td className="truncate px-3 py-2 text-fg-muted" title={t.milestone?.title}>
                  {t.milestone?.title ?? ""}
                </td>
                <td className="px-3 py-2">
                  {t.acTotal > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                      <ProgressRing value={t.acDone} max={t.acTotal} />
                      {t.acDone}/{t.acTotal}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted tabular-nums">
                  <RelTime date={t.updatedAt} />
                </td>
              </TaskRow>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Link
              href={pageHref(page - 1)}
              scroll={false}
              aria-disabled={page <= 1 || undefined}
              tabIndex={page <= 1 ? -1 : undefined}
              className={buttonClass("secondary", "sm")}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Previous
            </Link>
            <span className="tabular-nums">
              Page {page} of {pages}
            </span>
            <Link
              href={pageHref(page + 1)}
              scroll={false}
              aria-disabled={page >= pages || undefined}
              tabIndex={page >= pages ? -1 : undefined}
              className={buttonClass("secondary", "sm")}
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
