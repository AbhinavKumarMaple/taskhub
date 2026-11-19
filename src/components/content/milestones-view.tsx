"use client";

import { Archive, ArchiveRestore, Flag, ListChecks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, SpaceChip } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Markdown } from "@/components/ui/markdown";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDue, percent, progressText } from "@/lib/format";
import { href } from "@/lib/nav";
import type { Milestone, SpaceRef } from "@/lib/types";
import {
  archiveMilestoneAction,
  createMilestoneAction,
  deleteMilestoneAction,
  restoreMilestoneAction,
  updateMilestoneAction,
} from "@/server/actions/content-actions";
import { ArchivedChip, defaultSpaceId, ListToolbar, SpaceSelect } from "./shared";
import { useActionRunner } from "./use-action";

type Props = {
  milestones: Milestone[];
  spaces: SpaceRef[];
  selectedSpace: string | null;
  archived: boolean;
  filtered: boolean;
};

export function MilestonesView({ milestones, spaces, selectedSpace, archived, filtered }: Props) {
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const { run, pending } = useActionRunner();

  const canCreate = spaces.length > 0;
  return (
    <div>
      <PageHeader
        title="Milestones"
        description="Group tasks toward a goal or date. The board can show one swimlane per milestone."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")} disabled={!canCreate}>
            New milestone
          </Button>
        }
      />
      <ListToolbar placeholder="Filter milestones" />

      {milestones.length === 0 ? (
        <EmptyState
          icon={<Flag />}
          title={archived ? "No archived milestones" : filtered ? "No milestones match" : "No milestones yet"}
          description={
            archived
              ? "Archived milestones appear here. Turn off “Showing archived” to see active ones."
              : filtered
                ? "Try fewer words, or clear the filter."
                : canCreate
                  ? "Create a milestone, then pick it on tasks to track progress toward it."
                  : "Create a Space first, then add milestones to it."
          }
          action={
            !archived && !filtered ? (
              canCreate ? (
                <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
                  New milestone
                </Button>
              ) : (
                <Link href="/spaces" className="text-[13px] font-medium text-accent hover:underline">
                  Go to Spaces
                </Link>
              )
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {milestones.map((m) => (
            <MilestoneRow
              key={m.ref}
              m={m}
              selectedSpace={selectedSpace}
              showSpace={!selectedSpace}
              onEdit={() => setEditing(m)}
              onDelete={() => setDeleting(m)}
              onArchive={() =>
                run(() => archiveMilestoneAction(m.ref), { success: `Archived ${m.ref}` })
              }
              onRestore={() =>
                run(() => restoreMilestoneAction(m.ref), { success: `Restored ${m.ref}` })
              }
            />
          ))}
        </ul>
      )}

      <MilestoneDialog
        key={editing === "new" ? "new" : editing?.ref ?? "closed"}
        open={editing !== null}
        milestone={editing === "new" ? null : editing}
        spaces={spaces}
        selectedSpace={selectedSpace}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.ref} forever?`}
        message="Tasks keep their place but lose this milestone. This cannot be undone."
        confirmLabel="Delete forever"
        danger
        pending={pending}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await run(() => deleteMilestoneAction(deleting.ref), { success: `Deleted ${deleting.ref}` });
          if (ok) setDeleting(null);
        }}
      />
    </div>
  );
}

function MilestoneRow({
  m,
  selectedSpace,
  showSpace,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  m: Milestone;
  selectedSpace: string | null;
  showSpace: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const due = formatDue(m.dueDate);
  const complete = m.taskTotal > 0 && m.taskDone >= m.taskTotal;
  const tasksLink = href("/tasks", { milestone: m.ref }, selectedSpace);
  const boardLink = href("/board", { milestone: m.ref }, selectedSpace);
  const items: MenuItem[] = m.archivedAt
    ? [
        { label: "Restore", icon: <ArchiveRestore />, onSelect: onRestore },
        "separator",
        { label: "Delete forever…", icon: <Trash2 />, onSelect: onDelete, danger: true },
      ]
    : [
        { label: "Edit", icon: <Pencil />, onSelect: onEdit },
        { label: "View tasks", icon: <ListChecks />, href: tasksLink },
        { label: "Open on board", icon: <Flag />, href: boardLink },
        "separator",
        { label: "Archive", icon: <Archive />, onSelect: onArchive },
      ];
  return (
    <li className="flex items-start gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-fg-subtle">{m.ref}</span>
          {m.archivedAt ? (
            <span className="truncate text-[13px] font-medium">{m.title}</span>
          ) : (
            <button type="button" onClick={onEdit} className="truncate text-left text-[13px] font-medium hover:text-accent">
              {m.title}
            </button>
          )}
          {showSpace && <SpaceChip space={m.space} />}
          {m.archivedAt && <ArchivedChip />}
          {due && (
            <Chip size="xs" tone={complete ? "done" : due.overdue ? "danger" : due.today ? "waiting" : "outline"}>
              {due.overdue && !complete ? "Overdue · " : due.today ? "Due today · " : "Due "}
              {due.label}
            </Chip>
          )}
        </div>
        {m.description.trim() && (
          <div className="mt-1 line-clamp-2 text-fg-muted">
            <Markdown className="text-[12.5px]">{m.description}</Markdown>
          </div>
        )}
      </div>
      <div className="flex w-56 shrink-0 flex-col gap-1.5 pt-0.5">
        <ProgressBar value={m.taskDone} max={m.taskTotal} tone="auto" label={`${m.ref} progress`} />
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <Link href={tasksLink} className="hover:text-fg hover:underline">
            {m.taskTotal ? progressText(m.taskDone, m.taskTotal) : "No tasks yet"}
          </Link>
          <span className={cn("tabular-nums", complete && "text-done-fg")}>{percent(m.taskDone, m.taskTotal)}%</span>
        </div>
      </div>
      <DropdownMenu
        label={`Actions for ${m.ref}`}
        trigger={<MoreHorizontal className="size-4" />}
        triggerClassName="size-7"
        items={items}
      />
    </li>
  );
}

function MilestoneDialog({
  open,
  milestone,
  spaces,
  selectedSpace,
  onClose,
}: {
  open: boolean;
  milestone: Milestone | null;
  spaces: SpaceRef[];
  selectedSpace: string | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [spaceId, setSpaceId] = useState(milestone?.space.id ?? defaultSpaceId(spaces, selectedSpace));
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const { run, pending, error } = useActionRunner();

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    const due = dueDate || null;
    const ok = milestone
      ? await run(() => updateMilestoneAction(milestone.ref, { title: t, description, dueDate: due }), {
          inline: true,
          success: `Saved ${milestone.ref}`,
        })
      : await run(() => createMilestoneAction({ spaceId, title: t, description, dueDate: due }), {
          inline: true,
          success: "Milestone created",
        });
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={milestone ? `Edit ${milestone.ref}` : "New milestone"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!title.trim() || (!milestone && !spaceId)}>
            {milestone ? "Save" : "Create milestone"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Title" htmlFor="ms-title">
          <Input id="ms-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {milestone ? (
            <Field label="Space">
              <div className="flex h-8 items-center">
                <SpaceChip space={milestone.space} size="sm" />
              </div>
            </Field>
          ) : (
            <Field label="Space" htmlFor="ms-space">
              <SpaceSelect id="ms-space" spaces={spaces} value={spaceId} onChange={setSpaceId} />
            </Field>
          )}
          <Field label="Due date" htmlFor="ms-due" hint="Optional">
            <Input id="ms-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <MarkdownEditor value={description} onChange={setDescription} rows={6} onSubmit={save} aria-label="Description" />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
