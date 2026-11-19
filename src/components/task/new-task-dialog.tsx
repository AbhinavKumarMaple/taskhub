"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createTaskAction, getTaskFormOptionsAction } from "@/server/actions/task-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { withParams } from "@/lib/nav";
import type { Settings, SpaceRef, TaskFull } from "@/lib/types";
import { TagInput } from "./fields";

type Options = {
  settings: Settings;
  spaces: SpaceRef[];
  milestones: { ref: string; title: string; spaceId: string }[];
};

export type NewTaskDefaults = {
  spaceId?: string;
  /** Create as a child of this task (lives in the parent's Space). */
  parent?: string;
  type?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  labels?: string[];
  isDraft?: boolean;
};

export type NewTaskDialogProps = {
  open: boolean;
  onClose: () => void;
  defaults?: NewTaskDefaults;
  /** Dialog title, e.g. "New draft". */
  title?: string;
  /**
   * After a successful create. Default: close and open the new task's sheet by setting `?task=<ref>`
   * on the current URL (pages that mount <TaskSheet /> show it).
   */
  onCreated?: (task: TaskFull) => void;
};

let cache: Options | null = null;

/** Create a task (or draft): title, Space, type, status, priority, milestone, due date, labels, description, ACs. */
export function NewTaskDialog({ open, onClose, defaults, title, onCreated }: NewTaskDialogProps) {
  const [opts, setOpts] = useState<Options | null>(cache);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getTaskFormOptionsAction().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        cache = r.data;
        setOpts(r.data);
      } else setLoadError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const heading = title ?? (defaults?.isDraft ? "New draft" : defaults?.parent ? `New subtask of ${defaults.parent.toUpperCase()}` : "New task");

  return (
    <Dialog open={open} onClose={onClose} title={heading} size="lg">
      {opts ? (
        <NewTaskForm opts={opts} defaults={defaults} onClose={onClose} onCreated={onCreated} />
      ) : loadError ? (
        <p className="py-4 text-[13px] text-danger" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col gap-3 py-2" aria-busy="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </Dialog>
  );
}

function NewTaskForm({
  opts,
  defaults = {},
  onClose,
  onCreated,
}: {
  opts: Options;
  defaults?: NewTaskDefaults;
  onClose: () => void;
  onCreated?: (task: TaskFull) => void;
}) {
  const { settings, spaces, milestones } = opts;
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { success } = useToast();
  const id = useId();
  const urlSpace = sp.get("space");
  const initialSpace =
    [defaults.spaceId, urlSpace].find((s) => s && spaces.some((x) => x.id === s)) ?? spaces[0]?.id ?? "";
  const parent = defaults.parent?.toUpperCase();
  const childType = settings.types.includes("sub-feature") ? "sub-feature" : settings.types[0];

  const [f, setF] = useState({
    title: "",
    spaceId: initialSpace,
    type: defaults.type ?? (parent ? childType : settings.types.includes("feature") ? "feature" : settings.types[0]),
    status: defaults.status ?? settings.defaultStatus,
    priority: defaults.priority ?? "",
    milestone: defaults.milestone ?? "",
    dueDate: "",
    labels: defaults.labels ?? [],
    description: "",
    ac: "",
    isDraft: defaults.isDraft ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const spaceMilestones = milestones.filter((m) => m.spaceId === f.spaceId);

  const submit = async () => {
    if (!f.title.trim()) return setError("Give the task a title.");
    if (!parent && !f.spaceId) return setError("Create a Space first (Spaces page).");
    setBusy(true);
    setError(null);
    const r = await createTaskAction({
      title: f.title.trim(),
      ...(parent ? { parent } : { spaceId: f.spaceId }),
      type: f.type,
      status: f.status,
      priority: f.priority || null,
      milestone: f.milestone || null,
      dueDate: f.dueDate || null,
      labels: f.labels,
      description: f.description || undefined,
      acceptanceCriteria: f.ac
        .split("\n")
        .map((s) => s.replace(/^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?)?/, "").trim())
        .filter(Boolean),
      isDraft: f.isDraft,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    success(`${r.data.ref} created`, r.data.title);
    onClose();
    if (onCreated) onCreated(r.data);
    else router.push(withParams(sp, { task: r.data.ref }, pathname), { scroll: false });
  };

  return (
    <form
      className="flex flex-col gap-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <Field label="Title" htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" required maxLength={200} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {parent ? (
          <Field label="Parent">
            <span className="flex h-8 items-center font-mono text-[13px] text-fg-muted">{parent}</span>
          </Field>
        ) : (
          <Field label="Space" htmlFor={`${id}-space`}>
            <Select
              id={`${id}-space`}
              value={f.spaceId}
              onChange={(e) => setF((x) => ({ ...x, spaceId: e.target.value, milestone: "" }))}
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={spaces.length ? undefined : "No Spaces yet"}
            />
          </Field>
        )}
        <Field label="Type" htmlFor={`${id}-type`}>
          <Select id={`${id}-type`} value={f.type} onChange={(e) => set("type", e.target.value)} options={settings.types.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Status" htmlFor={`${id}-status`}>
          <Select id={`${id}-status`} value={f.status} onChange={(e) => set("status", e.target.value)} options={settings.statuses.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Priority" htmlFor={`${id}-priority`}>
          <Select
            id={`${id}-priority`}
            value={f.priority}
            placeholder="None"
            onChange={(e) => set("priority", e.target.value)}
            options={settings.priorities.map((t) => ({ value: t, label: t }))}
          />
        </Field>
        {!parent && (
          <Field label="Milestone" htmlFor={`${id}-milestone`}>
            <Select
              id={`${id}-milestone`}
              value={f.milestone}
              placeholder="None"
              onChange={(e) => set("milestone", e.target.value)}
              options={spaceMilestones.map((m) => ({ value: m.ref, label: `${m.ref} · ${m.title}` }))}
            />
          </Field>
        )}
        <Field label="Due date" htmlFor={`${id}-due`}>
          <Input id={`${id}-due`} type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
      </div>
      <Field label="Labels" htmlFor={`${id}-labels`}>
        <TagInput id={`${id}-labels`} label="Add label" values={f.labels} suggestions={settings.labels} onChange={(v) => set("labels", v)} placeholder="Add a label" />
      </Field>
      <Field label="Description">
        <MarkdownEditor value={f.description} onChange={(v) => set("description", v)} rows={5} aria-label="Description" />
      </Field>
      <Field label="Acceptance criteria" htmlFor={`${id}-ac`} hint="One per line.">
        <Textarea id={`${id}-ac`} rows={3} value={f.ac} onChange={(e) => set("ac", e.target.value)} placeholder={"Users can …\nErrors show …"} />
      </Field>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Checkbox label="Save as draft" checked={f.isDraft} onChange={(e) => set("isDraft", e.target.checked)} />
        <span className="ml-auto text-xs text-fg-subtle">⌘Enter</span>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {f.isDraft ? "Create draft" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
