import Link from "next/link";
import { LabelChip, SpaceChip, StatusChip, TypeChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { CountRow, TaskSummary } from "@/lib/types";

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </div>
  );
}

export function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <h2 className="mb-3 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Horizontal bars, one row per value, the count as a direct label. */
export function CountBars({ rows, tone }: { rows: CountRow[]; tone?: (name: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-[13px] text-fg-muted">Nothing to count yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-[13px]" title={`${r.name}: ${r.count}`}>
          <span className="truncate text-fg-muted">{r.name}</span>
          <span className="h-2 rounded-full bg-surface-2">
            <span
              className={cn("block h-full rounded-full", tone?.(r.name) ?? "bg-accent")}
              style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count > 0 ? 4 : 0 }}
            />
          </span>
          <span className="text-right tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Weekly created vs completed: paired vertical bars, legend above, a hidden table for screen readers. */
export function WeeklyChart({ weeks }: { weeks: { weekStart: string; created: number; completed: number }[] }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]));
  const H = 140;
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-fg-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent" /> Created
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-done" /> Completed
        </span>
      </div>
      <div className="flex items-end gap-2 border-b border-border" style={{ height: H }} aria-hidden>
        {weeks.map((w) => (
          <div
            key={w.weekStart}
            className="group flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm hover:bg-surface-2/60"
            title={`Week of ${formatDate(w.weekStart)}: ${w.created} created, ${w.completed} completed`}
          >
            {[
              { v: w.created, cls: "bg-accent" },
              { v: w.completed, cls: "bg-done" },
            ].map((b, i) => (
              <span
                key={i}
                className={cn("w-full max-w-4 rounded-t-[4px]", b.cls)}
                style={{ height: `${(b.v / max) * (H - 8)}px`, minHeight: b.v > 0 ? 2 : 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-fg-subtle" aria-hidden>
        {weeks.map((w) => (
          <span key={w.weekStart} className="flex-1 truncate text-center tabular-nums">
            {formatDate(w.weekStart)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Tasks created and completed per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Created</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{formatDate(w.weekStart)}</td>
              <td>{w.created}</td>
              <td>{w.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact task list for the statistics panels. */
export function TaskMiniList({
  items,
  hrefFor,
  statuses,
  empty,
  showAge,
}: {
  items: TaskSummary[];
  hrefFor: (ref: string) => string;
  statuses: string[];
  empty: string;
  showAge?: boolean;
}) {
  if (items.length === 0) return <p className="text-[13px] text-fg-muted">{empty}</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {items.map((t) => (
        <li key={t.ref}>
          <Link
            href={hrefFor(t.ref)}
            scroll={false}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2"
          >
            <span className="w-16 shrink-0 font-mono text-xs text-fg-muted">{t.ref}</span>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <TypeChip type={t.type} className="hidden lg:inline-flex" />
            {t.labels.includes("waiting") && !showAge && <LabelChip label="waiting" />}
            <SpaceChip space={t.space} className="hidden xl:inline-flex" />
            <StatusChip status={t.status} statuses={statuses} size="xs" />
            {showAge && <span className="w-16 shrink-0 text-right text-xs text-fg-muted tabular-nums">{formatDate(t.createdAt)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
