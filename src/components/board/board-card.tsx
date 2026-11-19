"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Flag, GitBranch } from "lucide-react";
import { memo, type KeyboardEvent, type Ref } from "react";
import { LabelChip, PriorityMarker, SpaceChip, TypeChip } from "@/components/ui/chip";
import { ProgressRing } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDue, relativeTime } from "@/lib/format";
import type { TaskSummary } from "@/lib/types";

type CardBodyProps = {
  task: TaskSummary;
  showSpace: boolean;
  showMilestone: boolean;
};

/** What a card shows. Used by the sortable card and by the drag overlay. */
export function CardBody({ task: t, showSpace, showMilestone }: CardBodyProps) {
  const due = formatDue(t.dueDate);
  const showChildren = t.childTotal > 0;
  return (
    <>
      <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <span className="font-mono font-medium text-fg-muted">{t.ref}</span>
        <TypeChip type={t.type} />
        {showSpace && <SpaceChip space={t.space} />}
        <span className="ml-auto flex items-center">
          <PriorityMarker priority={t.priority} />
        </span>
      </div>

      <p className="mt-1.5 line-clamp-3 text-[13px] font-medium leading-snug text-fg">{t.title}</p>

      {(t.labels.length > 0 || (showMilestone && t.milestone)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {t.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {showMilestone && t.milestone && (
            <span
              className="inline-flex h-[18px] max-w-full items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-fg-muted"
              title={`Milestone ${t.milestone.ref}`}
            >
              <Flag className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{t.milestone.title}</span>
            </span>
          )}
        </div>
      )}

      {showChildren && (
        <div className="mt-2 flex items-center gap-2" title={`${t.childDone} of ${t.childTotal} sub-tasks done`}>
          <GitBranch className="size-3 shrink-0 text-fg-subtle" aria-hidden />
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn("h-full rounded-full", t.childDone >= t.childTotal ? "bg-done" : "bg-accent")}
              style={{ width: `${Math.round((t.childDone / t.childTotal) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-fg-muted">
            {t.childDone}/{t.childTotal}
            <span className="sr-only"> sub-tasks done</span>
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-subtle">
        {t.acTotal > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums" title={`Acceptance criteria: ${t.acDone} of ${t.acTotal}`}>
            <ProgressRing value={t.acDone} max={t.acTotal} size={12} label={`Acceptance criteria ${t.acDone} of ${t.acTotal}`} />
            {t.acDone}/{t.acTotal}
          </span>
        )}
        {due && (
          <span
            className={cn("inline-flex items-center gap-1", due.overdue && "text-danger", due.today && "text-waiting-fg")}
            title={due.overdue ? "Overdue" : due.today ? "Due today" : "Due"}
          >
            <CalendarDays className="size-3" aria-hidden />
            {due.label}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {t.assignees.length > 0 && <Assignees names={t.assignees} />}
          <time dateTime={new Date(t.updatedAt).toISOString()} title={`Updated ${new Date(t.updatedAt).toLocaleString()}`} suppressHydrationWarning>
            {relativeTime(t.updatedAt)}
          </time>
        </span>
      </div>
    </>
  );
}

function Assignees({ names }: { names: string[] }) {
  const shown = names.slice(0, 3);
  return (
    <span className="flex -space-x-1" title={names.join(", ")} aria-label={`Assigned to ${names.join(", ")}`}>
      {shown.map((n) => (
        <span
          key={n}
          aria-hidden
          className="inline-flex size-[18px] items-center justify-center rounded-full bg-surface-3 text-[9px] font-semibold uppercase text-fg-muted ring-2 ring-surface"
        >
          {n.replace(/^@/, "").slice(0, 2)}
        </span>
      ))}
      {names.length > shown.length && (
        <span aria-hidden className="inline-flex size-[18px] items-center justify-center rounded-full bg-surface-3 text-[9px] text-fg-muted ring-2 ring-surface">
          +{names.length - shown.length}
        </span>
      )}
    </span>
  );
}

export const cardClass =
  "block w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-2 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent";

type SortableCardProps = CardBodyProps & {
  col: number;
  index: number;
  selected: boolean;
  /** A drag is in progress somewhere on the board (disables arrow-key focus moves). */
  boardDragging: boolean;
  onOpen: (ref: string) => void;
  onArrow: (col: number, index: number, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => void;
};

/** A draggable card. Click or Enter opens it; arrows move focus; Space picks it up for a keyboard drag. */
export const SortableCard = memo(function SortableCard({
  task,
  showSpace,
  showMilestone,
  col,
  index,
  selected,
  boardDragging,
  onOpen,
  onArrow,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.ref });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.defaultPrevented || boardDragging) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(task.ref);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onArrow(col, index, e.key);
    }
  };

  return (
    <div
      ref={setNodeRef as Ref<HTMLDivElement>}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(task.ref)}
      data-card={task.ref}
      data-col={col}
      data-index={index}
      aria-roledescription="Draggable card"
      aria-label={`${task.ref} ${task.title}, ${task.status}`}
      aria-current={selected || undefined}
      className={cn(
        cardClass,
        "touch-manipulation",
        selected && "border-accent ring-1 ring-accent",
        isDragging && "opacity-40",
      )}
    >
      <CardBody task={task} showSpace={showSpace} showMilestone={showMilestone} />
    </div>
  );
});
