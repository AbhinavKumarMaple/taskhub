"use client";

import {
  Archive,
  ArrowRightLeft,
  CircleDot,
  FilePen,
  ImagePlus,
  MessageSquare,
  MoveRight,
  Plus,
  RotateCcw,
  Rocket,
  Trash2,
  ArrowUpFromLine,
  ArrowDownToLine,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldLabel } from "@/lib/field-labels";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Activity, ActivityAction, FieldChanges } from "@/lib/types";
import { Section } from "./section";

const ICONS: Record<ActivityAction, LucideIcon> = {
  created: Plus,
  updated: FilePen,
  status: ArrowRightLeft,
  archived: Archive,
  restored: RotateCcw,
  deleted: Trash2,
  commented: MessageSquare,
  promoted: ArrowUpFromLine,
  demoted: ArrowDownToLine,
  moved: MoveRight,
  attached: ImagePlus,
  deployed: Rocket,
};


/** Internal bookkeeping fields that mean nothing to a reader (board position, child ref counter). */
const HIDDEN_FIELDS = new Set(["ordinal", "childCounter"]);

/** The changes worth showing a person. */
export function visibleChanges(changes: FieldChanges | null | undefined): FieldChanges {
  return Object.fromEntries(Object.entries(changes ?? {}).filter(([k]) => !HIDDEN_FIELDS.has(k)));
}

/** Human text for one side of a diff. */
export function formatValue(v: unknown, max = 120): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? truncate(v.map((x) => formatValue(x, 60)).join(", "), max) : "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return truncate(JSON.stringify(v), max);
  return truncate(String(v).replace(/\s+/g, " "), max);
}
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Field diff (from → to) with readable field names. Shared by the task and the global activity timelines. */
export function Diff({ changes }: { changes: FieldChanges }) {
  const entries = Object.entries(visibleChanges(changes));
  if (!entries.length) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs">
      {entries.map(([field, { from, to }]) => (
        <div key={field} className="contents">
          <dt className="text-fg-muted">{fieldLabel(field)}</dt>
          <dd className="min-w-0 break-words">
            <span className="text-fg-subtle line-through decoration-fg-subtle/50">{formatValue(from)}</span>
            <span className="px-1 text-fg-subtle" aria-label="changed to">
              →
            </span>
            <span className="text-fg">{formatValue(to)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Newest-first timeline of activity rows, with field diffs behind a toggle. */
export function ActivityTimeline({ items, initial = 15 }: { items: Activity[]; initial?: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, initial);
  return (
    <Section title="Activity" meta={items.length || undefined}>
      {items.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">No activity yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
          {shown.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </ol>
      )}
      {items.length > initial && (
        <Button size="xs" variant="ghost" className="mt-2" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </Section>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const Icon = ICONS[a.action] ?? CircleDot;
  const n = Object.keys(visibleChanges(a.changes)).length;
  const [open, setOpen] = useState(false);
  return (
    <li className="relative flex gap-2.5">
      <span className="relative z-[1] mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg-subtle">
        <Icon className="size-3" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] leading-snug break-words text-fg">{a.summary}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
          <span>{a.actor}</span>
          <span aria-hidden>·</span>
          <time dateTime={new Date(a.createdAt).toISOString()} title={formatDateTime(a.createdAt)} suppressHydrationWarning>
            {relativeTime(a.createdAt)}
          </time>
          {n > 0 && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="rounded px-1 text-accent hover:underline"
            >
              {open ? "Hide changes" : `${n} ${n === 1 ? "change" : "changes"}`}
            </button>
          )}
        </div>
        {open && <Diff changes={a.changes} />}
      </div>
    </li>
  );
}
