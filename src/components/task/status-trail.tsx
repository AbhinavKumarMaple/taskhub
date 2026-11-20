"use client";

import { History } from "lucide-react";
import { StatusChip } from "@/components/ui/chip";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Settings, StatusEvent } from "@/lib/types";
import { Section } from "./section";

/** "3d 4h", "45m", "just now". */
export function spanLabel(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 && h < 6 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 && d < 7 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Total time spent in each status, in the order the statuses are configured. */
export function timeInStatus(events: StatusEvent[], now: Date = new Date()): { status: string; ms: number }[] {
  const steps = events.filter((e, i) => i === 0 || e.to !== e.from);
  const out = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) {
    const start = new Date(steps[i].createdAt).getTime();
    const end = i + 1 < steps.length ? new Date(steps[i + 1].createdAt).getTime() : now.getTime();
    out.set(steps[i].to, (out.get(steps[i].to) ?? 0) + Math.max(0, end - start));
  }
  return [...out].map(([status, ms]) => ({ status, ms }));
}

/** Every status the task has been in: who moved it, when, why, and how long it stayed. */
export function StatusTrail({
  events,
  settings,
}: {
  events: StatusEvent[];
  settings: Pick<Settings, "statuses" | "doneStatus" | "closedStatuses" | "stoppedStatuses">;
}) {
  if (!events.length) return null;
  const now = new Date();
  // Durations: from this step until the next real status change.
  const changes = events.map((e, i) => {
    const isEdit = i > 0 && e.from === e.to;
    let next = i + 1;
    while (next < events.length && events[next].from === events[next].to) next++;
    const until = next < events.length ? new Date(events[next].createdAt) : now;
    return { e, isEdit, ms: until.getTime() - new Date(e.createdAt).getTime(), current: next >= events.length };
  });
  const totals = timeInStatus(events, now).sort(
    (a, b) => settings.statuses.indexOf(a.status) - settings.statuses.indexOf(b.status),
  );
  return (
    <Section title="Status history" meta={`${events.filter((e, i) => i === 0 || e.from !== e.to).length} steps`}>
      {totals.length > 1 && (
        <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
          {totals.map((t) => (
            <span key={t.status}>
              {t.status} <span className="tabular-nums text-fg">{spanLabel(t.ms)}</span>
            </span>
          ))}
        </p>
      )}
      <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
        {changes.map(({ e, isEdit, ms, current }) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-border-strong" aria-hidden />
            <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
              {isEdit ? (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <History className="size-3.5" aria-hidden /> Reason updated
                </span>
              ) : (
                <>
                  {e.from && (
                    <>
                      <StatusChip status={e.from} statuses={settings.statuses} size="xs" />
                      <span className="text-fg-subtle" aria-label="to">
                        →
                      </span>
                    </>
                  )}
                  <StatusChip status={e.to} statuses={settings.statuses} size="xs" />
                  {!e.from && <span className="text-xs text-fg-subtle">created</span>}
                </>
              )}
              <span className="text-xs text-fg-subtle">
                by {e.actor} ·{" "}
                <time dateTime={new Date(e.createdAt).toISOString()} title={formatDateTime(e.createdAt)} suppressHydrationWarning>
                  {relativeTime(e.createdAt)}
                </time>
                {!isEdit && (
                  <>
                    {" "}
                    · {current ? `${spanLabel(ms)} so far` : `stayed ${spanLabel(ms)}`}
                  </>
                )}
              </span>
            </div>
            {e.reason && <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{e.reason}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}
