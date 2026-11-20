"use client";

import {
  Archive,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Link2,
  Maximize2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import {
  addCommentAction,
  archiveTaskAction,
  createTaskAction,
  deleteTaskAction,
  demoteTaskAction,
  getTaskDetailAction,
  promoteDraftAction,
  restoreTaskAction,
  updateTaskAction,
} from "@/server/actions/task-actions";
import type { TaskDetailData } from "@/server/actions/task-detail-data";
import type { ActionResult } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Chip, SpaceChip, SpaceDot, TypeChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatDue } from "@/lib/format";
import { href, taskHref, withParams } from "@/lib/nav";
import type { TaskFull } from "@/lib/types";
import type { UpdateTaskInput } from "@/server/validation";
import { ActivityTimeline } from "./activity-timeline";
import { Attachments } from "./attachments";
import { StatusReasonDialog, type ReasonRequest } from "./status-reason-dialog";
import { StatusTrail } from "./status-trail";
import { StatusReason } from "@/components/board/board-card";
import { Checklist } from "./checklist";
import { Comments } from "./comments";
import { Dependencies, RefPicker } from "./dependencies";
import { DateInput, InlineTitle, MarkdownField, StringList, TagInput } from "./fields";
import { applyOptimistic } from "./optimistic";
import { PropRow, Section } from "./section";
import { Subtasks } from "./subtasks";

export type TaskDetailProps = {
  data: TaskDetailData;
  /** "sheet" keeps navigation inside `?task=`; "page" links to /tasks/[ref]. Default "page". */
  mode?: "page" | "sheet";
  /** Called after the task is deleted (sheet: close it). Page mode goes to /archive by default. */
  onDeleted?: () => void;
};

/** Full task view, every field editable inline with optimistic saves. Used by the sheet and the full page. */
export function TaskDetail({ data: incoming, mode = "page", onDeleted }: TaskDetailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const space = sp.get("space");
  const { success, error: toastError } = useToast();

  // Local copy; replaced when the server sends new props (page mode refresh) or an action returns.
  const [data, setData] = useState(incoming);
  const [prevIncoming, setPrevIncoming] = useState(incoming);
  if (incoming !== prevIncoming) {
    setPrevIncoming(incoming);
    setData(incoming);
  }
  const { task, settings, spaces, milestones } = data;
  const ref = task.ref;
  const seq = useRef(0);
  const [confirm, setConfirm] = useState<null | "delete" | { spaceId: string }>(null);
  const [busy, setBusy] = useState(false);
  const [pickingParent, setPickingParent] = useState(false);
  const [reasonReq, setReasonReq] = useState<ReasonRequest | null>(null);

  const linkFor = (r: string) => (mode === "sheet" ? withParams(sp, { task: r }, pathname) : taskHref(r, space));
  const fullHref = taskHref(ref, space);

  const reload = async () => {
    const r = await getTaskDetailAction(ref);
    if (r.ok) setData(r.data);
  };

  const setTask = (t: TaskFull) => setData((d) => ({ ...d, task: t }));

  /** Optimistic update; resolves to an error message or null. */
  const save = async (patch: UpdateTaskInput, opts: { quiet?: boolean; reload?: boolean } = {}): Promise<string | null> => {
    const my = ++seq.current;
    setData((d) => ({ ...d, task: applyOptimistic(d.task, patch, { milestones: d.milestones, spaces: d.spaces }) }));
    const r = await updateTaskAction({ ref, ...patch });
    if (!r.ok) {
      if (!opts.quiet) toastError("Couldn't save", r.error);
      await reload();
      return r.error;
    }
    if (opts.reload) await reload();
    else if (my === seq.current) setTask(r.data);
    return null;
  };

  /** Archive / restore / promote / demote: actions that return the full task. */
  const run = async (fn: (r: string) => Promise<ActionResult<TaskFull>>, done: string) => {
    setBusy(true);
    const r = await fn(ref);
    setBusy(false);
    if (!r.ok) return toastError("Couldn't do that", r.error);
    setTask(r.data);
    success(done);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      success(`${what} copied`, text);
    } catch {
      toastError("Couldn't copy", text);
    }
  };

  /** New parent (or top level). The task gets a new ref, so follow it in the URL. */
  const changeParent = async (parent: string | null): Promise<string | null> => {
    const r = await updateTaskAction({ ref, parent });
    if (!r.ok) return r.error;
    setPickingParent(false);
    success(
      parent ? `Moved under ${parent}` : "Now a top-level task",
      r.data.ref !== ref ? `${ref} is now ${r.data.ref}` : undefined,
    );
    if (r.data.ref !== ref) router.replace(linkFor(r.data.ref), { scroll: false });
    else setTask(r.data);
    return null;
  };

  const doDelete = async () => {
    setBusy(true);
    const r = await deleteTaskAction(ref);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return toastError("Couldn't delete", r.error);
    success(`${ref} deleted`);
    if (onDeleted) onDeleted();
    else router.replace(href("/archive", {}, space));
  };

  /** Status select: a status that needs a reason asks for one first. */
  const changeStatus = (to: string) => {
    if (to === task.status) return;
    if (settings.reasonStatuses.includes(to)) setReasonReq({ ref, title: task.title, from: task.status, to });
    else void save({ status: to });
  };
  const inReasonStatus = settings.reasonStatuses.includes(task.status);
  const stopped = settings.stoppedStatuses.includes(task.status);
  const resumeTo = settings.statuses.find(
    (st) => st !== settings.defaultStatus && !settings.reasonStatuses.includes(st) && !settings.closedStatuses.includes(st),
  ) ?? settings.defaultStatus;

  const archived = !!task.archivedAt;
  const statusOptions = withCurrent(settings.statuses, task.status);
  const typeOptions = withCurrent(settings.types, task.type);
  const priorityOptions = withCurrent(settings.priorities, task.priority);
  const childTypes = ["sub-feature", "fix"].filter((t) => settings.types.includes(t));
  const due = formatDue(task.dueDate);
  const milestoneOptions = [
    ...milestones.map((m) => ({ value: m.ref, label: `${m.ref} · ${m.title}` })),
    ...(task.milestone && !milestones.some((m) => m.ref === task.milestone!.ref)
      ? [{ value: task.milestone.ref, label: `${task.milestone.ref} · ${task.milestone.title}` }]
      : []),
  ];

  const menuItems: MenuItem[] = [
    { label: "Copy ref", icon: <Copy />, onSelect: () => copy(ref, "Ref") },
    { label: "Copy link", icon: <Link2 />, onSelect: () => copy(`${window.location.origin}${taskHref(ref)}`, "Link") },
    ...(mode === "sheet" ? [{ label: "Open full page", icon: <Maximize2 />, href: fullHref }] : []),
    "separator",
    task.isDraft
      ? { label: "Promote to task", icon: <ArrowUpFromLine />, onSelect: () => run(promoteDraftAction, `${ref} promoted`) }
      : { label: "Demote to draft", icon: <ArrowDownToLine />, onSelect: () => run(demoteTaskAction, `${ref} moved to drafts`) },
    archived
      ? { label: "Restore", icon: <RotateCcw />, onSelect: () => run(restoreTaskAction, `${ref} restored`) }
      : { label: "Archive", icon: <Archive />, onSelect: () => run(archiveTaskAction, `${ref} archived`) },
    archived
      ? { label: "Delete forever…", icon: <Trash2 />, danger: true, onSelect: () => setConfirm("delete") }
      : { label: "Delete", icon: <Trash2 />, disabled: true, hint: "Archive first" },
  ];

  // ── Blocks ──────────────────────────────────────────────────────────────────
  const topBar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {mode === "page" && <span className="font-mono text-[13px] font-medium text-fg-muted">{ref}</span>}
      <SpaceChip space={task.space} size="sm" />
      <TypeChip type={task.type} size="sm" />
      {task.isDraft && <Chip tone="waiting">Draft</Chip>}
      {archived && <Chip tone="outline">Archived</Chip>}
      <div className="ml-auto flex items-center gap-1">
        {busy && <span className="text-xs text-fg-subtle">Working…</span>}
        <DropdownMenu label="Task actions" trigger={<MoreHorizontal className="size-4" />} items={menuItems} />
      </div>
    </div>
  );

  const banners = (
    <>
      {inReasonStatus && (
        <div className="flex flex-wrap items-start gap-2">
          <StatusReason
            status={task.status}
            reason={task.statusReason}
            since={task.statusChangedAt}
            stopped={stopped}
            className="mt-0 min-w-0 flex-1 px-2.5 py-2 text-[13px]"
          />
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setReasonReq({ ref, title: task.title, from: task.status, to: task.status, initial: task.statusReason })}
            >
              Edit reason
            </Button>
            <Button size="xs" variant="secondary" onClick={() => void save({ status: resumeTo })}>
              {stopped ? `Unblock → ${resumeTo}` : `Reopen → ${resumeTo}`}
            </Button>
          </div>
        </div>
      )}
      {archived && (
        <Banner
          text={`Archived ${formatDate(task.archivedAt)}. It is hidden from the board and lists.`}
          action={
            <Button size="xs" variant="secondary" icon={<RotateCcw className="size-3" />} onClick={() => run(restoreTaskAction, `${ref} restored`)}>
              Restore
            </Button>
          }
        />
      )}
      {task.isDraft && !archived && (
        <Banner
          text="This is a draft. It stays off the board until you promote it."
          action={
            <Button size="xs" variant="secondary" icon={<ArrowUpFromLine className="size-3" />} onClick={() => run(promoteDraftAction, `${ref} promoted`)}>
              Promote
            </Button>
          }
        />
      )}
    </>
  );

  const title = <InlineTitle value={task.title} onSave={(v) => save({ title: v })} />;

  const properties = (
    <div className="flex flex-col gap-0.5">
      <PropRow label="Status" htmlFor={`${ref}-status`}>
        <Select
          id={`${ref}-status`}
          selectSize="sm"
          value={task.status}
          options={statusOptions.map((s) => ({ value: s, label: s }))}
          onChange={(e) => changeStatus(e.target.value)}
        />
      </PropRow>
      <PropRow label="Type" htmlFor={`${ref}-type`}>
        <Select
          id={`${ref}-type`}
          selectSize="sm"
          value={task.type}
          options={typeOptions.map((s) => ({ value: s, label: s }))}
          onChange={(e) => save({ type: e.target.value })}
        />
      </PropRow>
      <PropRow label="Priority" htmlFor={`${ref}-priority`}>
        <Select
          id={`${ref}-priority`}
          selectSize="sm"
          value={task.priority ?? ""}
          placeholder="None"
          options={priorityOptions.map((s) => ({ value: s, label: s }))}
          onChange={(e) => save({ priority: e.target.value || null })}
        />
      </PropRow>
      <PropRow label="Space" htmlFor={task.parentRef ? undefined : `${ref}-space`}>
        {task.parentRef ? (
          <span className="inline-flex items-center gap-1.5 text-[13px]" title="A subtask lives in its parent's Space">
            <SpaceDot color={task.space.color} />
            {task.space.name}
          </span>
        ) : (
          <Select
            id={`${ref}-space`}
            selectSize="sm"
            value={task.space.id}
            options={withCurrentSpace(spaces, task.space).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(e) => e.target.value !== task.space.id && setConfirm({ spaceId: e.target.value })}
          />
        )}
      </PropRow>
      <PropRow label="Parent">
        {pickingParent ? (
          <div className="flex flex-col gap-1.5">
            <RefPicker label="New parent" spaceId={task.space.id} exceptRef={ref} onPick={changeParent} />
            <div className="flex gap-1.5">
              {task.parent && (
                <Button size="xs" variant="secondary" onClick={() => void changeParent(null)}>
                  Make top level
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setPickingParent(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            {task.parent ? (
              <Link href={linkFor(task.parent.ref)} scroll={false} className="flex min-w-0 items-center gap-1.5 text-[13px] hover:underline">
                <span className="shrink-0 font-mono text-xs text-fg-muted">{task.parent.ref}</span>
                <span className="truncate">{task.parent.title}</span>
              </Link>
            ) : (
              <span className="text-[13px] text-fg-subtle">None (top level)</span>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              onClick={() => setPickingParent(true)}
              title="Move under another task (its ref changes)"
            >
              Change
            </Button>
          </div>
        )}
      </PropRow>
      <PropRow label="Milestone" htmlFor={`${ref}-milestone`}>
        <Select
          id={`${ref}-milestone`}
          selectSize="sm"
          value={task.milestone?.ref ?? ""}
          placeholder={milestoneOptions.length ? "None" : "None (no milestones in this Space)"}
          options={milestoneOptions}
          onChange={(e) => save({ milestone: e.target.value || null })}
        />
      </PropRow>
      <PropRow label="Due date" htmlFor={`${ref}-due`}>
        <div className="flex items-center gap-2">
          <DateInput
            id={`${ref}-due`}
            inputSize="sm"
            className={cn("w-40", due?.overdue && "text-danger")}
            value={task.dueDate ?? ""}
            onSave={(v) => void save({ dueDate: v || null })}
          />
          {due?.overdue && <Chip tone="danger" size="xs">Overdue</Chip>}
          {due?.today && <Chip tone="waiting" size="xs">Today</Chip>}
        </div>
      </PropRow>
      <PropRow label="Assignees" htmlFor={`${ref}-assignees`}>
        <TagInput
          id={`${ref}-assignees`}
          label="Add assignee"
          placeholder="Add a name"
          values={task.assignees}
          onChange={(v) => save({ assignees: v })}
          renderChip={(v) => <Chip size="sm" tone="outline">@{v}</Chip>}
        />
      </PropRow>
      <PropRow label="Labels" htmlFor={`${ref}-labels`}>
        <TagInput
          id={`${ref}-labels`}
          label="Add label"
          placeholder="Add a label"
          values={task.labels}
          suggestions={settings.labels}
          onChange={(v) => save({ labels: v })}
        />
      </PropRow>
    </div>
  );

  const description = (
    <MarkdownField
      title="Description"
      value={task.description}
      onSave={(v) => save({ description: v })}
      emptyText="Add a description: what this is and why it matters."
      rows={10}
    />
  );

  const checklists = (
    <>
      <Checklist
        title="Acceptance criteria"
        items={task.acceptanceCriteria}
        emptyText="No acceptance criteria yet. Add what must be true for this to count as done."
        addLabel="Add criterion"
        onToggle={(i, c) => save(c ? { checkAc: [i] } : { uncheckAc: [i] })}
        onAdd={(t) => save({ addAc: [t] })}
        onEdit={(i, t) => save({ editAc: [{ index: i, text: t }] })}
        onRemove={(i) => save({ removeAc: [i] })}
        onReorder={(order) => save({ reorderAc: order })}
      />
      <Checklist
        title="Definition of Done"
        items={task.definitionOfDone}
        emptyText="No Definition of Done items. Defaults come from Settings."
        onToggle={(i, c) => save(c ? { checkDod: [i] } : { uncheckDod: [i] })}
        onAdd={(t) => save({ addDod: [t] })}
        onEdit={(i, t) => save({ editDod: [{ index: i, text: t }] })}
        onRemove={(i) => save({ removeDod: [i] })}
        onReorder={(order) => save({ reorderDod: order })}
      />
    </>
  );

  const subtasks = (
    <Subtasks
      items={task.children}
      statuses={settings.statuses}
      doneStatus={settings.doneStatus}
      childTypes={childTypes.length ? childTypes : settings.types.slice(0, 1)}
      linkFor={linkFor}
      onAdd={async (t, type) => {
        const r = await createTaskAction({ parent: ref, title: t, type });
        if (!r.ok) return r.error;
        success(`${r.data.ref} created`);
        await reload();
        return null;
      }}
    />
  );

  const linkOther = async (other: string, op: "addDeps" | "removeDeps") => {
    const r = await updateTaskAction({ ref: other, [op]: [ref] });
    await reload();
    return r.ok ? null : r.error;
  };

  const dependencies = (
    <Dependencies
      taskRef={ref}
      spaceId={task.space.id}
      dependsOn={task.dependsOn}
      blocks={task.blocks}
      statuses={settings.statuses}
      linkFor={linkFor}
      onAddDependsOn={(r) => save({ addDeps: [r] }, { quiet: true })}
      onRemoveDependsOn={(r) => void save({ removeDeps: [r] })}
      onAddBlocks={(r) => linkOther(r, "addDeps")}
      onRemoveBlocks={(r) =>
        void linkOther(r, "removeDeps").then((e) => e && toastError("Couldn't remove", e))
      }
    />
  );

  const writeups = (
    <>
      <MarkdownField title="Implementation plan" value={task.plan} onSave={(v) => save({ plan: v })} emptyText="Add a plan: the steps you intend to take." />
      <MarkdownField title="Notes" value={task.notes} onSave={(v) => save({ notes: v })} emptyText="Add notes as the work goes." />
      <MarkdownField
        title="Final summary"
        value={task.finalSummary}
        onSave={(v) => save({ finalSummary: v })}
        emptyText="Add a final summary when the work is done: what changed and what is left."
      />
    </>
  );

  const lists = (
    <>
      <StringList
        title="References"
        values={task.references}
        onChange={(v) => save({ references: v })}
        emptyText="No references."
        placeholder="URL or text"
      />
      <StringList
        title="Documentation"
        values={task.documentation}
        onChange={(v) => save({ documentation: v })}
        emptyText="No documentation links."
        placeholder="URL, DOC-ref or path"
      />
      <StringList
        title="Modified files"
        values={task.modifiedFiles}
        onChange={(v) => save({ modifiedFiles: v })}
        emptyText="No files recorded."
        placeholder="path/to/file.ts"
        mono
      />
    </>
  );

  const comments = (
    <Comments
      comments={task.comments}
      onAdd={async (body) => {
        const r = await addCommentAction({ ref, body });
        if (!r.ok) return r.error;
        await reload();
        return null;
      }}
    />
  );

  const activity = <ActivityTimeline items={task.activity} />;
  const trail = <StatusTrail events={task.statusHistory} settings={settings} />;
  const screenshots = <Attachments taskRef={ref} items={task.attachments} onChanged={reload} />;

  const dates = (
    <p className="text-xs text-fg-subtle">
      Created <span title={formatDateTime(task.createdAt)}>{formatDate(task.createdAt)}</span> · Updated{" "}
      <span title={formatDateTime(task.updatedAt)}>{formatDate(task.updatedAt)}</span>
    </p>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        pending={busy}
        danger
        title={`Delete ${ref} forever?`}
        message="The task, its checklists and comments are removed for good. Its activity history stays. This cannot be undone."
        confirmLabel="Delete forever"
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (typeof confirm !== "object" || !confirm) return;
          const to = confirm.spaceId;
          setConfirm(null);
          const err = await save({ spaceId: to }, { reload: true });
          if (!err) success(`${ref} moved to ${spaces.find((s) => s.id === to)?.name ?? "the Space"}`);
        }}
        title={`Move ${ref} to ${typeof confirm === "object" && confirm ? (spaces.find((s) => s.id === confirm.spaceId)?.name ?? "another Space") : ""}?`}
        message="Its subtasks move with it. The milestone is cleared and dependencies on tasks in other Spaces are removed."
        confirmLabel="Move"
      />
      <StatusReasonDialog
        request={reasonReq}
        onCancel={() => setReasonReq(null)}
        onConfirm={async (reason) => {
          const to = reasonReq?.to;
          setReasonReq(null);
          if (to) await save({ status: to, reason });
        }}
      />
    </>
  );

  if (mode === "sheet") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {topBar}
          {banners}
          {title}
        </div>
        {properties}
        {description}
        {checklists}
        {subtasks}
        {dependencies}
        {screenshots}
        {writeups}
        {lists}
        {comments}
        {trail}
        {activity}
        {dates}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <Link href={href("/tasks", {}, space)} className="inline-flex w-fit items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> All tasks
      </Link>
      {topBar}
      {banners}
      {title}
      {/* The aside comes first in the markup so narrow screens show Properties right under the title. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside className="flex min-w-0 flex-col gap-6 lg:order-last lg:border-l lg:border-border lg:pl-6">
          <Section title="Properties">{properties}</Section>
          {trail}
          {lists}
          {dates}
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          {description}
          {checklists}
          {subtasks}
          {dependencies}
          {screenshots}
          {writeups}
          {comments}
          {activity}
        </div>
      </div>
      {dialogs}
    </div>
  );
}

function Banner({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted">
      <span className="flex-1">{text}</span>
      {action}
    </div>
  );
}

const withCurrent = (list: string[], cur: string | null) => (cur && !list.includes(cur) ? [...list, cur] : list);
const withCurrentSpace = <T extends { id: string }>(list: T[], cur: T) => (list.some((s) => s.id === cur.id) ? list : [...list, cur]);
