"use client";

import { CornerDownRight, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { findTasksAction } from "@/server/actions/task-actions";
import { Button, IconButton } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { isTaskRef } from "@/lib/format";
import type { DepNode, TaskLite } from "@/lib/types";
import { Section } from "./section";

type Props = {
  taskRef: string;
  spaceId: string;
  dependsOn: DepNode[];
  blocks: DepNode[];
  statuses: string[];
  linkFor: (ref: string) => string;
  /** Resolve to an error message, or null on success. */
  onAddDependsOn: (ref: string) => Promise<string | null>;
  onRemoveDependsOn: (ref: string) => void;
  onAddBlocks: (ref: string) => Promise<string | null>;
  onRemoveBlocks: (ref: string) => void;
  disabled?: boolean;
};

/** Depends on / Blocks, each transitive (indented by depth), with add by ref search and remove of direct links. */
export function Dependencies(p: Props) {
  return (
    <Section title="Dependencies" meta={p.dependsOn.length + p.blocks.length ? undefined : "None"}>
      <div className="flex flex-col gap-3">
        <DepList
          heading="Depends on"
          hint="This task waits on these."
          nodes={p.dependsOn}
          statuses={p.statuses}
          linkFor={p.linkFor}
          onRemove={p.onRemoveDependsOn}
          picker={
            !p.disabled && (
              <RefPicker
                label="Add a task this depends on"
                spaceId={p.spaceId}
                exceptRef={p.taskRef}
                onPick={p.onAddDependsOn}
              />
            )
          }
          disabled={p.disabled}
        />
        <DepList
          heading="Blocks"
          hint="These wait on this task."
          nodes={p.blocks}
          statuses={p.statuses}
          linkFor={p.linkFor}
          onRemove={p.onRemoveBlocks}
          picker={
            !p.disabled && (
              <RefPicker label="Add a task this blocks" spaceId={p.spaceId} exceptRef={p.taskRef} onPick={p.onAddBlocks} />
            )
          }
          disabled={p.disabled}
        />
      </div>
    </Section>
  );
}

function DepList({
  heading,
  hint,
  nodes,
  statuses,
  linkFor,
  onRemove,
  picker,
  disabled,
}: {
  heading: string;
  hint: string;
  nodes: DepNode[];
  statuses: string[];
  linkFor: (ref: string) => string;
  onRemove: (ref: string) => void;
  picker: React.ReactNode;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-fg-muted">{heading}</span>
        <span className="text-xs text-fg-subtle">{nodes.length ? nodes.filter((n) => n.depth === 1).length : hint}</span>
        {!disabled && !adding && (
          <Button size="xs" variant="ghost" className="ml-auto" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
            Add
          </Button>
        )}
      </div>
      {nodes.length > 0 && (
        <ul className="flex flex-col">
          {nodes.map((n, i) => (
            <li
              key={`${n.ref}-${n.via ?? ""}-${i}`}
              className="group flex items-center gap-1.5 rounded-md py-0.5 pr-0.5 hover:bg-surface-2"
              style={{ paddingLeft: `${(n.depth - 1) * 16 + 4}px` }}
            >
              {n.depth > 1 && <CornerDownRight className="size-3 shrink-0 text-fg-subtle" aria-label={`via ${n.via}`} />}
              <Link href={linkFor(n.ref)} scroll={false} className="flex min-w-0 flex-1 items-center gap-2 text-[13px] hover:underline">
                <span className="shrink-0 font-mono text-xs text-fg-muted">{n.ref}</span>
                <span className={cn("truncate", n.archivedAt && "text-fg-subtle line-through")}>{n.title}</span>
              </Link>
              <StatusChip status={n.status} statuses={statuses} size="xs" />
              {n.depth === 1 && !disabled ? (
                <IconButton
                  label={`Remove ${n.ref}`}
                  size="xs"
                  className="touch-reveal opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onRemove(n.ref)}
                >
                  <X className="size-3" />
                </IconButton>
              ) : (
                <span className="size-6 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-1 flex items-start gap-2">
          <div className="flex-1">{picker}</div>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

/** Ref / title search in the task's Space. Enter picks the highlighted result or the typed ref. */
export function RefPicker({
  label,
  spaceId,
  exceptRef,
  onPick,
}: {
  label: string;
  spaceId: string;
  exceptRef?: string;
  onPick: (ref: string) => Promise<string | null>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TaskLite[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    const my = ++req.current;
    if (!term) return;
    const t = setTimeout(async () => {
      const r = await findTasksAction({ q: term, spaceId, exceptRef });
      if (my !== req.current) return;
      setResults(r.ok ? r.data : []);
      setActive(0);
    }, 180);
    return () => clearTimeout(t);
  }, [q, spaceId, exceptRef]);

  const shown = q.trim() ? results : [];

  const pick = async (ref: string) => {
    setBusy(true);
    setError(null);
    const err = await onPick(ref.toUpperCase());
    setBusy(false);
    if (err) setError(err);
    else {
      setQ("");
      setResults([]);
    }
  };

  const submit = () => {
    const hit = shown[active];
    if (hit) return pick(hit.ref);
    const term = q.trim();
    if (!term) return;
    if (!isTaskRef(term)) {
      setError("Type a task ref like T-12, or pick a task from the list.");
      return;
    }
    return pick(term);
  };

  return (
    <div className="relative">
      <Input
        autoFocus
        inputSize="sm"
        value={q}
        aria-label={label}
        placeholder="Search by ref or title"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setError(null);
          if (!e.target.value.trim()) setResults([]);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape" && q) {
            e.preventDefault();
            e.stopPropagation();
            setQ("");
            setResults([]);
          }
        }}
      />
      {busy && <Loader2 className="absolute top-2 right-2 size-3.5 animate-spin text-fg-subtle" aria-hidden />}
      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching tasks"
          className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {shown.map((t, i) => (
            <li
              key={t.ref}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(t.ref)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px]",
                i === active && "bg-surface-2",
              )}
            >
              <span className="shrink-0 font-mono text-xs text-fg-muted">{t.ref}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-xs text-fg-subtle">{t.status}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
