"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { updateSettingsAction } from "@/server/actions/content-actions";
import type { UpdateSettingsInput } from "@/server/validation";
import { useUnsavedWarning } from "./editable";
import { isDirty, moveRow, newRow, planList, rowsFrom, type ListRow } from "./settings-model";
import { useActionRunner } from "./use-action";

type ListKey = "statuses" | "types" | "priorities" | "labels" | "dodDefaults";

const SECTIONS: {
  key: ListKey;
  title: string;
  description: ReactNode;
  addPlaceholder: string;
  allowEmpty: boolean;
  renames: boolean;
  maxLength: number;
}[] = [
  {
    key: "statuses",
    title: "Statuses",
    description: "The order here is the order of the board columns. The last status counts as done.",
    addPlaceholder: "Add a status, e.g. Review",
    allowEmpty: false,
    renames: true,
    maxLength: 100,
  },
  {
    key: "types",
    title: "Types",
    description: "What kind of item a task is. “feature” is the main board view; “sub-feature” is the default for children.",
    addPlaceholder: "Add a type",
    allowEmpty: false,
    renames: true,
    maxLength: 100,
  },
  {
    key: "priorities",
    title: "Priorities",
    description: "Highest first. Tasks may also have no priority.",
    addPlaceholder: "Add a priority",
    allowEmpty: true,
    renames: true,
    maxLength: 100,
  },
  {
    key: "labels",
    title: "Labels",
    description: "Suggested labels. “waiting” is shown in amber and listed on Statistics.",
    addPlaceholder: "Add a label",
    allowEmpty: true,
    renames: true,
    maxLength: 100,
  },
  {
    key: "dodDefaults",
    title: "Definition of Done defaults",
    description: "Checklist items added to every new task, unless the chat asks for none.",
    addPlaceholder: "Add a Definition of Done item",
    allowEmpty: true,
    renames: false,
    maxLength: 500,
  },
];

export function SettingsView({ settings }: { settings: Settings }) {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description={
          <>
            Shared by every Space. Renaming a value here updates every task that uses it; removing a value still in
            use is refused. Last saved {formatDateTime(settings.updatedAt)}.
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {SECTIONS.map((s) => (
          <ListSection
            // Remount (fresh rows) when this list changes on the server, without touching other sections' drafts.
            key={`${s.key}:${JSON.stringify(settings[s.key])}:${s.key === "statuses" ? settings.defaultStatus : ""}`}
            section={s}
            saved={settings[s.key]}
            settings={settings}
          />
        ))}
      </div>
    </div>
  );
}

function ListSection({
  section,
  saved,
  settings,
}: {
  section: (typeof SECTIONS)[number];
  saved: string[];
  settings: Settings;
}) {
  const [rows, setRows] = useState<ListRow[]>(() => rowsFrom(saved));
  const [adding, setAdding] = useState("");
  const isStatuses = section.key === "statuses";
  const [defaultRowId, setDefaultRowId] = useState<string | null>(() =>
    isStatuses ? (rows.find((r) => r.original === settings.defaultStatus)?.id ?? null) : null,
  );
  const { run, pending, error, setError } = useActionRunner();

  const defaultRow = rows.find((r) => r.id === defaultRowId) ?? rows[0];
  const defaultChanged = isStatuses && (defaultRow?.value.trim() ?? "") !== settings.defaultStatus;
  const dirty = isDirty(rows, saved) || defaultChanged;
  useUnsavedWarning(dirty);

  const update = (fn: (r: ListRow[]) => ListRow[]) => {
    setError(null);
    setRows(fn);
  };

  const add = () => {
    const v = adding.trim();
    if (!v) return;
    update((r) => [...r, newRow(v)]);
    setAdding("");
  };

  const save = async () => {
    const plan = planList(rows, saved, {
      allowEmptyList: section.allowEmpty,
      renames: section.renames,
      maxLength: section.maxLength,
    });
    if (!plan.ok) {
      setError(plan.error);
      return;
    }
    const input: UpdateSettingsInput = { [section.key]: plan.values };
    if (section.renames && plan.renames.length && section.key !== "dodDefaults") {
      input.renames = { [section.key]: plan.renames };
    }
    if (isStatuses && defaultRow) input.defaultStatus = defaultRow.value.trim();
    await run(() => updateSettingsAction(input), { inline: true, success: `${section.title} saved` });
  };

  const reset = () => {
    const fresh = rowsFrom(saved);
    setRows(fresh);
    setDefaultRowId(isStatuses ? (fresh.find((r) => r.original === settings.defaultStatus)?.id ?? null) : null);
    setAdding("");
    setError(null);
  };

  const headingId = `settings-${section.key}`;
  const last = rows.length - 1;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 id={headingId} className="text-[14px] font-semibold">
          {section.title}
        </h2>
        <p className="mt-0.5 text-xs text-fg-muted">{section.description}</p>
      </div>

      <div className="px-5 py-3">
        {rows.length === 0 ? (
          <p className="py-2 text-[13px] text-fg-subtle">None yet. Add one below.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {rows.map((r, i) => {
              const renamed = section.renames && r.original !== null && r.value.trim() !== r.original;
              return (
                <li key={r.id} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-fg-subtle">{i + 1}</span>
                  <Input
                    inputSize="sm"
                    value={r.value}
                    maxLength={section.maxLength}
                    aria-label={`${section.title} ${i + 1}`}
                    aria-invalid={!r.value.trim() || undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      update((rs) => rs.map((x) => (x.id === r.id ? { ...x, value } : x)));
                    }}
                    className="min-w-0 flex-1"
                  />
                  <div className="flex w-44 shrink-0 items-center gap-1.5 overflow-hidden">
                    {isStatuses && i === last && (
                      <Chip size="xs" tone="done" dot title="Tasks in the last status count as done">
                        done
                      </Chip>
                    )}
                    {isStatuses && defaultRow?.id === r.id && <Chip size="xs" tone="accent">default</Chip>}
                    {r.original === null && <Chip size="xs" tone="outline">new</Chip>}
                    {renamed && (
                      <span className="truncate text-[11px] text-fg-subtle" title={`Renamed from ${r.original}`}>
                        was “{r.original}”
                      </span>
                    )}
                  </div>
                  <IconButton label="Move up" size="xs" disabled={i === 0} onClick={() => update((rs) => moveRow(rs, i, -1))}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton label="Move down" size="xs" disabled={i === last} onClick={() => update((rs) => moveRow(rs, i, 1))}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${r.value || "row"}`}
                    size="xs"
                    disabled={!section.allowEmpty && rows.length === 1}
                    onClick={() => update((rs) => rs.filter((x) => x.id !== r.id))}
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-2 flex items-center gap-1.5 pl-6.5">
          <Input
            inputSize="sm"
            value={adding}
            maxLength={section.maxLength}
            placeholder={section.addPlaceholder}
            aria-label={section.addPlaceholder}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="min-w-0 flex-1"
          />
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={add} disabled={!adding.trim()}>
            Add
          </Button>
        </div>

        {isStatuses && rows.length > 0 && (
          <div className="mt-3 flex items-center gap-2 pl-6.5">
            <label htmlFor="default-status" className="text-xs text-fg-muted">
              New tasks start in
            </label>
            <Select
              id="default-status"
              selectSize="sm"
              value={defaultRow?.id ?? ""}
              onChange={(e) => setDefaultRowId(e.target.value)}
              options={rows.map((r) => ({ value: r.id, label: r.value.trim() || "(empty)" }))}
              className="w-48"
            />
          </div>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center gap-3 border-t border-border px-5 py-2.5", !dirty && !error && "bg-surface-2/40")}>
        <div className="min-w-0 flex-1">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : dirty ? (
            <ChangeSummary rows={rows} saved={saved} renames={section.renames} defaultChanged={defaultChanged} />
          ) : (
            <p className="text-xs text-fg-subtle">No unsaved changes.</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={reset} disabled={!dirty || pending}>
          Reset
        </Button>
        <Button size="sm" variant="primary" onClick={save} loading={pending} disabled={!dirty}>
          Save {section.title.toLowerCase()}
        </Button>
      </div>
    </section>
  );
}

function ChangeSummary({
  rows,
  saved,
  renames,
  defaultChanged,
}: {
  rows: ListRow[];
  saved: string[];
  renames: boolean;
  defaultChanged: boolean;
}) {
  const kept = new Set(rows.map((r) => r.original));
  const parts: string[] = [];
  const added = rows.filter((r) => r.original === null).length;
  const removed = saved.filter((v) => !kept.has(v));
  const renamed = renames ? rows.filter((r) => r.original !== null && r.value.trim() !== r.original).length : 0;
  if (added) parts.push(`${added} added`);
  if (renamed) parts.push(`${renamed} renamed (tasks will be updated)`);
  if (removed.length) parts.push(`${removed.length} removed`);
  const order = rows.filter((r) => r.original !== null).map((r) => r.original);
  const savedOrder = saved.filter((v) => kept.has(v));
  if (order.join("\u0000") !== savedOrder.join("\u0000")) parts.push("order changed");
  if (!renames && rows.some((r) => r.original !== null && r.value.trim() !== r.original)) parts.push("edited");
  if (defaultChanged) parts.push("default status changed");
  return <p className="text-xs text-fg-muted">Unsaved: {parts.join(", ") || "changes"}.</p>;
}
