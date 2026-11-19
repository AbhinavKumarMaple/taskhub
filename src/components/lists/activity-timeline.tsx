"use client";

import { Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SpaceDot } from "@/components/ui/chip";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/format";
import { decisionHref, documentHref, href, taskHref, withParams } from "@/lib/nav";
import { loadActivityAction } from "@/server/actions/lists-actions";
import type { Activity, FieldChanges, SpaceRef } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  status: "Status",
  archived: "Archived",
  restored: "Restored",
  deleted: "Deleted",
  commented: "Comment",
  promoted: "Promoted",
  demoted: "Demoted",
  moved: "Moved",
};

function entityLink(a: Activity, space: string | null): string | null {
  if (a.action === "deleted") return null;
  switch (a.entityType) {
    case "task":
      return taskHref(a.entityRef, space);
    case "document":
      return documentHref(a.entityRef, space);
    case "decision":
      return decisionHref(a.entityRef, space);
    case "milestone":
      return href("/milestones", {}, space);
    case "space":
      return href("/spaces", {}, space);
    case "settings":
      return href("/settings", {}, space);
    default:
      return null;
  }
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "none";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

function Changes({ changes }: { changes: FieldChanges }) {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-fg-muted">
      {entries.slice(0, 6).map(([field, c]) => (
        <li key={field} className="truncate">
          <span className="text-fg-subtle">{field}:</span> <span className="line-through decoration-fg-subtle/60">{show(c?.from)}</span>
          {" → "}
          <span className="text-fg">{show(c?.to)}</span>
        </li>
      ))}
      {entries.length > 6 && <li>and {entries.length - 6} more</li>}
    </ul>
  );
}

/** Groups by calendar day; "Load more" fetches the next 50 older rows. */
export function ActivityTimeline({
  initial,
  nextBefore: initialNext,
  spaces,
  actors,
  spaceId,
  actor,
}: {
  initial: Activity[];
  nextBefore: number | null;
  spaces: SpaceRef[];
  actors: string[];
  spaceId?: string;
  actor?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [extra, setExtra] = useState<{ key: string; items: Activity[]; next: number | null }>({ key: "", items: [], next: null });
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Rows loaded with "Load more" belong to the current filter + first page only.
  const key = `${spaceId ?? ""}|${actor ?? ""}|${initial[0]?.id ?? ""}`;
  const loaded = extra.key === key ? extra : { key, items: [], next: initialNext };
  const items = [...initial, ...loaded.items];
  const next = loaded.items.length ? loaded.next : initialNext;

  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  const setFilter = (changes: Record<string, string | null>) =>
    startTransition(() => router.replace(withParams(sp, changes, pathname), { scroll: false }));

  const loadMore = async () => {
    if (next === null) return;
    setLoading(true);
    const r = await loadActivityAction({ spaceId, actor, before: next });
    setLoading(false);
    if (!r.ok) return toast.error("Could not load more", r.error);
    setExtra({ key, items: [...loaded.items, ...r.data.items], next: r.data.nextBefore });
  };

  const days: { day: string; rows: Activity[] }[] = [];
  for (const a of items) {
    const day = formatDate(a.createdAt, { alwaysYear: true });
    const last = days[days.length - 1];
    if (last?.day === day) last.rows.push(a);
    else days.push({ day, rows: [a] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Space"
          value={spaceId ?? ""}
          onChange={(e) => setFilter({ space: e.target.value || null })}
          placeholder="All Spaces"
          options={spaces.map((s) => ({ value: s.id, label: s.name }))}
          className="w-48"
        />
        <Select
          aria-label="Actor"
          value={actor ?? ""}
          onChange={(e) => setFilter({ actor: e.target.value || null })}
          placeholder="Everyone"
          options={actors.map((a) => ({ value: a, label: a }))}
          className="w-40"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon />}
          title="No activity here yet"
          description="Every change made in the app or by a connected chat shows up here. Try another Space or actor."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((d) => (
            <section key={d.day}>
              <h2 className="mb-2 text-xs font-medium text-fg-muted" suppressHydrationWarning>{d.day}</h2>
              <ol className="relative flex flex-col border-l border-border pl-4">
                {d.rows.map((a) => {
                  const s = a.spaceId ? spaceById.get(a.spaceId) : undefined;
                  const link = entityLink(a, spaceId ?? null);
                  return (
                    <li key={a.id} className="relative py-1.5">
                      <span className="absolute top-3 -left-[21px] size-2 rounded-full border-2 border-bg bg-fg-subtle" aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                        <time dateTime={new Date(a.createdAt).toISOString()} title={formatDateTime(a.createdAt)} className="w-11 shrink-0 text-xs text-fg-subtle tabular-nums" suppressHydrationWarning>
                          {new Date(a.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                        <span className="text-xs font-medium text-fg-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
                        {link ? (
                          <Link href={link} className="font-mono text-xs text-fg-muted hover:text-accent">
                            {a.entityRef}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-fg-subtle">{a.entityRef}</span>
                        )}
                        <span className="min-w-0">{a.summary}</span>
                        <span className="ml-auto flex items-center gap-2 text-xs text-fg-subtle">
                          {s && (
                            <span className="inline-flex items-center gap-1">
                              <SpaceDot color={s.color} />
                              {s.name}
                            </span>
                          )}
                          <span>by {a.actor}</span>
                        </span>
                      </div>
                      <div className="pl-[52px]">
                        <Changes changes={a.changes} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {next !== null && (
            <div>
              <Button variant="secondary" onClick={() => void loadMore()} loading={loading}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
