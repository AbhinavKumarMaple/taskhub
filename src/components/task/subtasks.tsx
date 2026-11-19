"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LabelChip, PriorityMarker, StatusChip, TypeChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { progressText } from "@/lib/format";
import type { TaskSummary } from "@/lib/types";
import { Section } from "./section";

/** Children with status chips, "n of m complete", and quick add of sub-features / fixes. */
export function Subtasks({
  items,
  statuses,
  doneStatus,
  childTypes,
  linkFor,
  onAdd,
  disabled,
}: {
  items: TaskSummary[];
  statuses: string[];
  doneStatus: string;
  /** Types offered by the add buttons, e.g. ["sub-feature", "fix"]. */
  childTypes: string[];
  linkFor: (ref: string) => string;
  /** Resolves to an error message, or null. */
  onAdd: (title: string, type: string) => Promise<string | null>;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = items.filter((c) => !c.archivedAt);
  const done = live.filter((c) => c.status === doneStatus).length;

  const submit = async () => {
    if (!adding || !title.trim()) return;
    setBusy(true);
    const err = await onAdd(title.trim(), adding);
    setBusy(false);
    setError(err);
    if (!err) setTitle("");
  };

  return (
    <Section
      title="Subtasks"
      meta={live.length ? progressText(done, live.length) : undefined}
      actions={
        !disabled &&
        childTypes.map((t) => (
          <Button
            key={t}
            size="xs"
            variant="ghost"
            icon={<Plus className="size-3.5" />}
            aria-pressed={adding === t}
            onClick={() => {
              setAdding(t);
              setError(null);
            }}
          >
            {t === "fix" ? "Add fix" : t === "sub-feature" ? "Add sub-feature" : `Add ${t}`}
          </Button>
        ))
      }
    >
      {live.length > 0 && <ProgressBar value={done} max={live.length} tone="auto" />}
      {items.length === 0 && !adding && <p className="text-[13px] text-fg-subtle">No subtasks. Split the work with Add sub-feature.</p>}
      {items.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {items.map((c) => (
            <li key={c.ref}>
              <Link
                href={linkFor(c.ref)}
                scroll={false}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-surface-2"
              >
                <span className="w-14 shrink-0 font-mono text-xs text-fg-muted">{c.ref}</span>
                <span className={cn("min-w-0 flex-1 truncate", (c.archivedAt || c.status === doneStatus) && "text-fg-subtle", c.archivedAt && "line-through")}>
                  {c.title}
                </span>
                {/* Fixed-width slots so every row's chips line up in columns. */}
                <span className="flex w-14 shrink-0 justify-end">
                  {c.labels.includes("waiting") && <LabelChip label="waiting" />}
                </span>
                <span className="flex w-3 shrink-0 justify-center">
                  <PriorityMarker priority={c.priority} />
                </span>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
                  {c.acTotal > 0 ? `${c.acDone}/${c.acTotal}` : ""}
                </span>
                <span className="hidden w-[5.5rem] shrink-0 sm:flex">
                  <TypeChip type={c.type} />
                </span>
                <span className="flex w-24 shrink-0">
                  <StatusChip status={c.status} statuses={statuses} size="xs" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              inputSize="sm"
              className="flex-1"
              value={title}
              aria-label={`New ${adding} title`}
              placeholder={`New ${adding} title`}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdding(null);
                  setTitle("");
                }
              }}
            />
            <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!title.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setAdding(null), setTitle(""), setError(null))}>
              Done
            </Button>
          </div>
          {error && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Section>
  );
}
