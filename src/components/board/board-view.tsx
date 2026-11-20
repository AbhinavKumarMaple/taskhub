"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive, ChevronsLeftRight, ChevronsRightLeft, Flag, KanbanSquare, MoreHorizontal, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { addCardAction, boardVersionAction, cleanupDoneAction, moveCardAction } from "@/app/(app)/board/actions";
import { Button, IconButton } from "@/components/ui/button";
import { statusTone } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { withParams } from "@/lib/nav";
import type { SpaceRef, TaskSummary } from "@/lib/types";
import {
  NO_MILESTONE,
  applyMove,
  arrowTarget,
  buildContainers,
  buildLanes,
  containerId,
  findContainer,
  moveBetween,
  optimisticOrdinal,
  parseContainerId,
  placementOf,
  samePlacement,
  type Lane,
  type Placement,
} from "./board-logic";
import { CardBody, SortableCard, cardClass } from "./board-card";
import { StatusReasonDialog, type ReasonRequest } from "@/components/task/status-reason-dialog";

const POLL_MS = 5000;

export type BoardFilters = {
  type: string[];
  labels: string[];
  priority: string[];
  assignee?: string;
  milestone?: string;
  q?: string;
};

export type BoardViewProps = {
  tasks: TaskSummary[];
  /** Why the list could not be loaded (bad filter), or null. */
  error: string | null;
  statuses: string[];
  doneStatus: string;
  /** Finished statuses (Done, Cancelled); the ones other than done start collapsed. */
  closedStatuses: string[];
  /** Dropping a card into one of these asks for a reason. */
  reasonStatuses: string[];
  /** Open-but-stopped statuses (Blocked): shown in red, counted on parent cards. */
  stoppedStatuses: string[];
  milestones: { ref: string; title: string; spaceId: string }[];
  spaces: SpaceRef[];
  /** Selected Space id, or undefined for All Spaces. */
  space?: string;
  grouped: boolean;
  filters: BoardFilters;
  /** Change marker at render time (for polling). */
  version: string;
};

const TONE_DOT: Record<string, string> = {
  todo: "bg-todo",
  progress: "bg-progress",
  done: "bg-done",
  blocked: "bg-danger",
  cancelled: "bg-fg-subtle",
  neutral: "bg-fg-subtle",
};

const COLLAPSE_KEY = "taskhub.board.collapsed";

/** Which columns are folded into a narrow strip. Default: closed statuses other than done (Cancelled). */
const collapseStore = {
  subscribe(cb: () => void) {
    window.addEventListener("storage", cb);
    window.addEventListener(COLLAPSE_KEY, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(COLLAPSE_KEY, cb);
    };
  },
  get(): string | null {
    try {
      return localStorage.getItem(COLLAPSE_KEY);
    } catch {
      return null; // private window: defaults
    }
  },
};

function useCollapsed(defaults: string[]) {
  const raw = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => null);
  const overrides = useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }, [raw]);
  const isCollapsed = (status: string) => overrides[status] ?? defaults.includes(status);
  const toggle = (status: string) => {
    const next = { ...overrides, [status]: !isCollapsed(status) };
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(COLLAPSE_KEY));
  };
  return { isCollapsed, toggle };
}

export function BoardView(props: BoardViewProps) {
  const { tasks, error, statuses, doneStatus, closedStatuses, reasonStatuses, stoppedStatuses, milestones, spaces, space, grouped, filters, version } =
    props;
  const roles = useMemo(() => ({ doneStatus, closedStatuses, stoppedStatuses }), [doneStatus, closedStatuses, stoppedStatuses]);
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsed(closedStatuses.filter((st) => st !== doneStatus));
  const [reasonReq, setReasonReq] = useState<(ReasonRequest & { end: Placement; start: Placement | null }) | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  const [optimisticTasks, addOptimistic] = useOptimistic(tasks, applyMove);
  const lanes = useMemo(
    () => buildLanes(grouped, milestones, optimisticTasks, filters.milestone),
    [grouped, milestones, optimisticTasks, filters.milestone],
  );
  const baseItems = useMemo(
    () => buildContainers(optimisticTasks, statuses, lanes, grouped),
    [optimisticTasks, statuses, lanes, grouped],
  );
  const byRef = useMemo(() => new Map(optimisticTasks.map((t) => [t.ref, t])), [optimisticTasks]);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragItems, setDragItems] = useState<Record<string, string[]> | null>(null);
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const startPlacement = useRef<Placement | null>(null);
  const dragging = useRef(false);
  const items = dragItems ?? baseItems;

  const dndId = useId(); // stable id so server and client markup match
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens a card, so only Space picks one up.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const ref = String(e.active.id);
    dragging.current = true;
    startPlacement.current = placementOf(baseItems, ref);
    setActiveRef(ref);
    setDragItems(baseItems);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragItems((cur) => {
      if (!cur) return cur;
      const ref = String(active.id);
      const overId = String(over.id);
      const from = findContainer(cur, ref);
      const to = findContainer(cur, overId);
      if (!from || !to || from === to) return cur;
      let index = cur[to].length;
      if (overId !== to) {
        const i = cur[to].indexOf(overId);
        const a = active.rect.current.translated;
        const below = a ? a.top > over.rect.top + over.rect.height / 2 : false;
        index = i + (below ? 1 : 0);
      }
      return moveBetween(cur, ref, to, index);
    });
  };

  const endDrag = () => {
    dragging.current = false;
    setDragItems(null);
    setActiveRef(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const ref = String(active.id);
    let final = dragItems ?? baseItems;
    if (over) {
      const overId = String(over.id);
      const c = findContainer(final, ref);
      if (c && overId !== ref && overId !== c && final[c].includes(overId)) {
        final = moveBetween(final, ref, c, final[c].indexOf(overId));
      }
    }
    const end = placementOf(final, ref);
    const start = startPlacement.current;
    endDrag();
    if (!end || samePlacement(start, end)) return;
    persistMove(end, start);
  };

  const persistMove = (end: Placement, start: Placement | null) => {
    const cur = byRef.get(end.ref);
    if (cur && end.status !== cur.status && reasonStatuses.includes(end.status)) {
      setReasonReq({ ref: end.ref, title: cur.title, from: cur.status, to: end.status, end, start });
      return;
    }
    saveMove(end, start);
  };

  const saveMove = (end: Placement, start: Placement | null, reason?: string) => {
    const laneChanged = grouped && start && start.lane !== end.lane;
    const milestoneRef = laneChanged ? (end.lane === NO_MILESTONE ? null : end.lane) : undefined;
    const milestone =
      milestoneRef === undefined
        ? undefined
        : milestoneRef === null
          ? null
          : { ref: milestoneRef, title: milestones.find((m) => m.ref === milestoneRef)?.title ?? milestoneRef };
    const ordinal = optimisticOrdinal(optimisticTasks, end, byRef.get(end.ref)?.ordinal ?? 0);
    startTransition(async () => {
      addOptimistic({ ref: end.ref, status: end.status, ordinal, milestone, reason });
      try {
        const res = await moveCardAction({
          ref: end.ref,
          status: end.status,
          reason,
          beforeRef: end.beforeRef,
          afterRef: end.beforeRef ? undefined : end.afterRef,
          milestone: milestoneRef,
        });
        if (!res.ok) toast.error(`Could not move ${end.ref}`, res.error);
      } catch {
        toast.error(`Could not move ${end.ref}`, "The server did not respond. The card is back where it was.");
      }
    });
  };

  // ── Polling: refresh when anything visible changed ───────────────────────
  const versionRef = useRef(version);
  useEffect(() => {
    versionRef.current = version;
  }, [version]);
  useEffect(() => {
    let busy = false;
    const poll = async () => {
      if (busy || dragging.current || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await boardVersionAction(space);
        if (res.ok && res.data !== versionRef.current && !dragging.current) {
          versionRef.current = res.data;
          startTransition(() => router.refresh());
        }
      } catch {
        // offline or server restarting: try again next tick
      } finally {
        busy = false;
      }
    };
    const id = setInterval(poll, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, space]);

  // ── Open / keyboard focus ────────────────────────────────────────────────
  const selected = sp.get("task")?.toUpperCase() ?? null;
  const spRef = useRef(sp);
  useEffect(() => {
    spRef.current = sp;
  }, [sp]);
  const onOpen = useCallback(
    (ref: string) => router.push(withParams(spRef.current, { task: ref }, pathname), { scroll: false }),
    [router, pathname],
  );

  const n = statuses.length;
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const onArrow = useCallback(
    (col: number, index: number, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
      const laneIdx = Math.floor(col / n);
      const lane = lanes[laneIdx];
      if (!lane) return;
      const counts = statuses.map((s) => (isCollapsed(s) ? 0 : (itemsRef.current[containerId(lane.key, s)]?.length ?? 0)));
      let target = arrowTarget(counts, col % n, index, key);
      let targetLane = laneIdx;
      // Up/down past the end of a lane: jump to the same column in the next/previous lane with cards.
      if (!target && (key === "ArrowUp" || key === "ArrowDown")) {
        const step = key === "ArrowDown" ? 1 : -1;
        for (let l = laneIdx + step; l >= 0 && l < lanes.length; l += step) {
          const len = itemsRef.current[containerId(lanes[l].key, statuses[col % n])]?.length ?? 0;
          if (len > 0) {
            target = { col: col % n, index: step > 0 ? 0 : len - 1 };
            targetLane = l;
            break;
          }
        }
      }
      if (!target) return;
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-col="${targetLane * n + target.col}"][data-index="${target.index}"]`)
        ?.focus();
    },
    [lanes, statuses, n, isCollapsed],
  );

  // ── Column actions ───────────────────────────────────────────────────────
  const [adding, setAdding] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const activeTask = activeRef ? byRef.get(activeRef) : undefined;
  const showSpace = !space && spaces.length > 1;
  const hasFilters =
    filters.labels.length > 0 || filters.priority.length > 0 || !!filters.assignee || !!filters.milestone || !!filters.q;
  const countIn = (status: string) => lanes.reduce((sum, l) => sum + (items[containerId(l.key, status)]?.length ?? 0), 0);

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-3">
      {error ? (
        <EmptyState icon={<KanbanSquare />} title="These filters could not be applied" description={error} />
      ) : (
        optimisticTasks.length === 0 && (
          <EmptyState
            icon={<KanbanSquare />}
            title={hasFilters ? "No cards match these filters" : "No cards here yet"}
            description={
              hasFilters
                ? "Clear a filter or change the search to see more."
                : "Use + on a column to add a card, or ask a connected chat to create one."
            }
            className="py-6"
          />
        )
      )}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="overflow-x-auto pb-2">
          {/* Columns share the width; the board scrolls sideways only when n × 264 px does not fit. */}
          <div
            className="grid w-full gap-x-3 gap-y-2"
            style={{ gridTemplateColumns: statuses.map((st) => (isCollapsed(st) ? "44px" : "minmax(248px, 1fr)")).join(" ") }}
          >
            {statuses.map((status) => (
              <ColumnHeader
                key={status}
                status={status}
                tone={statusTone(status, statuses, roles)}
                count={countIn(status)}
                isClosed={closedStatuses.includes(status)}
                collapsed={isCollapsed(status)}
                onToggle={() => toggleCollapsed(status)}
                onAdd={() => {
                  if (isCollapsed(status)) toggleCollapsed(status);
                  setAdding(containerId(lanes[0].key, status));
                }}
                onCleanup={() => setCleanupOpen(true)}
              />
            ))}

            {lanes.map((lane, li) => (
              <LaneRow
                key={lane.key}
                lane={lane}
                grouped={grouped}
                count={statuses.reduce((s, st) => s + (items[containerId(lane.key, st)]?.length ?? 0), 0)}
                n={n}
              >
                {statuses.map((status, si) => {
                  const cid = containerId(lane.key, status);
                  const refs = items[cid] ?? [];
                  if (isCollapsed(status))
                    return (
                      <CollapsedColumn
                        key={cid}
                        id={cid}
                        label={grouped ? `${status}, ${lane.title}` : status}
                        count={refs.length}
                        onExpand={() => toggleCollapsed(status)}
                      />
                    );
                  return (
                    <Column key={cid} id={cid} label={grouped ? `${status}, ${lane.title}` : status} empty={refs.length === 0} dragging={!!activeRef}>
                      {adding === cid && (
                        <AddCardForm
                          containerKey={cid}
                          lane={lane}
                          spaces={spaces}
                          space={space}
                          milestones={milestones}
                          filters={filters}
                          onClose={() => setAdding(null)}
                        />
                      )}
                      <SortableContext items={refs} strategy={verticalListSortingStrategy}>
                        {refs.map((ref, i) => {
                          const t = byRef.get(ref);
                          if (!t) return null;
                          return (
                            <SortableCard
                              key={ref}
                              task={t}
                              showSpace={showSpace}
                              showMilestone={!grouped}
                              reasonStatuses={reasonStatuses}
                              stoppedStatuses={stoppedStatuses}
                              col={li * n + si}
                              index={i}
                              selected={selected === ref}
                              boardDragging={!!activeRef}
                              onOpen={onOpen}
                              onArrow={onArrow}
                            />
                          );
                        })}
                      </SortableContext>
                      {grouped && adding !== cid && (
                        <button
                          type="button"
                          onClick={() => setAdding(cid)}
                          className="touch-reveal flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle opacity-0 outline-none transition-opacity hover:bg-surface-3 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent group-hover/col:opacity-100"
                        >
                          <Plus className="size-3.5" aria-hidden /> Add to {lane.title || status}
                        </button>
                      )}
                    </Column>
                  );
                })}
              </LaneRow>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className={cn(cardClass, "w-[264px] cursor-grabbing shadow-[var(--shadow-pop)] ring-1 ring-accent")}>
              <CardBody
                task={activeTask}
                showSpace={showSpace}
                showMilestone={!grouped}
                reasonStatuses={reasonStatuses}
                stoppedStatuses={stoppedStatuses}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CleanupDialog open={cleanupOpen} onClose={() => setCleanupOpen(false)} closedStatuses={closedStatuses} space={space} />
      <StatusReasonDialog
        request={reasonReq}
        onCancel={() => setReasonReq(null)}
        onConfirm={(reason) => {
          if (reasonReq) saveMove(reasonReq.end, reasonReq.start, reason);
          setReasonReq(null);
        }}
      />
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function ColumnHeader({
  status,
  tone,
  count,
  isClosed,
  collapsed,
  onToggle,
  onAdd,
  onCleanup,
}: {
  status: string;
  tone: string;
  count: number;
  isClosed: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onCleanup: () => void;
}) {
  if (collapsed)
    return (
      <button
        type="button"
        onClick={onToggle}
        title={`Show ${status} (${count})`}
        aria-label={`Show the ${status} column, ${pluralize(count, "card")}`}
        className="flex h-8 items-center justify-center gap-1 rounded-md text-fg-subtle outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone] ?? TONE_DOT.neutral)} aria-hidden />
        <ChevronsLeftRight className="size-3.5" aria-hidden />
      </button>
    );
  return (
    <div className="flex h-8 items-center gap-2 px-1">
      <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone] ?? TONE_DOT.neutral)} aria-hidden />
      <h2 className="truncate text-[13px] font-semibold">{status}</h2>
      <span className="text-xs tabular-nums text-fg-subtle" aria-label={pluralize(count, "card")}>
        {count}
      </span>
      <span className="ml-auto flex items-center">
        <IconButton label={`Add task to ${status}`} size="xs" onClick={onAdd}>
          <Plus className="size-3.5" />
        </IconButton>
        <DropdownMenu
          label={`${status} column actions`}
          trigger={<MoreHorizontal className="size-4" />}
          triggerClassName="h-6 min-w-6"
          items={[
            { label: "Add task", icon: <Plus />, onSelect: onAdd },
            { label: "Collapse column", icon: <ChevronsRightLeft />, onSelect: onToggle },
            ...(isClosed
              ? (["separator", { label: "Clean up finished tasks…", icon: <Archive />, onSelect: onCleanup }] as const)
              : []),
          ]}
        />
      </span>
    </div>
  );
}

function LaneRow({
  lane,
  grouped,
  count,
  n,
  children,
}: {
  lane: Lane;
  grouped: boolean;
  count: number;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {grouped && (
        <div
          className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-3 text-[13px] first:mt-0"
          style={{ gridColumn: `1 / span ${n}` }}
        >
          <Flag className="size-3.5 text-fg-subtle" aria-hidden />
          {lane.ref && <span className="font-mono text-xs text-fg-muted">{lane.ref}</span>}
          <span className="font-medium">{lane.title}</span>
          <span className="text-xs tabular-nums text-fg-subtle">{pluralize(count, "card")}</span>
        </div>
      )}
      {children}
    </>
  );
}

function Column({
  id,
  label,
  empty,
  dragging,
  children,
}: {
  id: string;
  label: string;
  empty: boolean;
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "group/col flex min-h-24 min-w-0 flex-col gap-2 rounded-lg bg-surface-2/60 p-2 transition-colors",
        isOver && "bg-accent-soft/60",
      )}
    >
      {children}
      {empty && (
        <p className={cn("px-1 py-4 text-center text-xs text-fg-subtle", dragging && "text-fg-muted")}>
          {dragging ? "Drop here" : "No cards"}
        </p>
      )}
    </section>
  );
}

/** A folded column: a narrow drop strip with the status name written down it. */
function CollapsedColumn({ id, label, count, onExpand }: { id: string; label: string; count: number; onExpand: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} (collapsed)`}
      className={cn(
        "flex min-h-24 min-w-0 flex-col items-center rounded-lg bg-surface-2/60 py-2 transition-colors",
        isOver && "bg-accent-soft/60",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col items-center gap-2 rounded-md px-1 py-1 text-xs text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        title={`Show ${label}`}
      >
        <span className="tabular-nums text-fg-subtle">{count}</span>
        <span className="font-medium [writing-mode:vertical-rl]">{label}</span>
      </button>
    </section>
  );
}

function AddCardForm({
  containerKey,
  lane,
  spaces,
  space,
  milestones,
  filters,
  onClose,
}: {
  containerKey: string;
  lane: Lane;
  spaces: SpaceRef[];
  space?: string;
  milestones: { ref: string; title: string; spaceId: string }[];
  filters: BoardFilters;
  onClose: () => void;
}) {
  const toast = useToast();
  const { status } = parseContainerId(containerKey);
  // A milestone (lane or filter) pins the Space to the milestone's.
  const filterMilestone =
    filters.milestone && filters.milestone.toLowerCase() !== NO_MILESTONE ? filters.milestone.toUpperCase() : undefined;
  const milestoneRef = lane.ref ?? (lane.key === NO_MILESTONE ? undefined : filterMilestone);
  const milestoneSpace = milestoneRef ? milestones.find((m) => m.ref === milestoneRef)?.spaceId : undefined;
  const fixedSpace = space ?? milestoneSpace ?? (spaces.length === 1 ? spaces[0].id : undefined);
  const [spaceId, setSpaceId] = useState(fixedSpace ?? spaces[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || pending) return;
    setPending(true);
    try {
      const res = await addCardAction({
        title: t,
        status,
        spaceId: fixedSpace ?? (spaceId || undefined),
        type: filters.type.length === 1 ? filters.type[0] : undefined,
        priority: filters.priority.length === 1 ? filters.priority[0] : undefined,
        labels: filters.labels.length ? filters.labels : undefined,
        assignees: filters.assignee ? [filters.assignee] : undefined,
        milestone: milestoneRef,
      });
      if (res.ok) {
        toast.success(`Created ${res.data.ref}`, t);
        setTitle("");
        inputRef.current?.focus();
      } else toast.error("Could not create the task", res.error);
    } finally {
      setPending(false);
    }
  };

  if (spaces.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-2 text-xs text-fg-muted">
        Create a Space first (Spaces page), then add tasks to it.
        <div className="mt-2 flex justify-end">
          <Button size="xs" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex flex-col gap-2 rounded-lg border border-accent bg-surface p-2"
      aria-label={`New task in ${status}`}
    >
      <Input
        ref={inputRef}
        inputSize="sm"
        autoFocus
        placeholder="Task title"
        aria-label="Task title"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
      />
      {!fixedSpace && (
        <Select
          selectSize="sm"
          aria-label="Space"
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          options={spaces.map((s) => ({ value: s.id, label: s.name }))}
        />
      )}
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-auto text-[11px] text-fg-subtle">Enter to add · Esc to close</span>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="xs" variant="primary" type="submit" loading={pending} disabled={!title.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}

function CleanupDialog({
  open,
  onClose,
  closedStatuses,
  space,
}: {
  open: boolean;
  onClose: () => void;
  closedStatuses: string[];
  space?: string;
}) {
  const names = closedStatuses.join(" or ");
  const toast = useToast();
  const [days, setDays] = useState("14");
  const [pending, setPending] = useState(false);
  const n = Number(days);
  // An empty box is not 0 days (that would archive every Done task).
  const valid = days.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 3650;

  const confirm = async () => {
    if (!valid) return;
    setPending(true);
    try {
      const res = await cleanupDoneAction(n, space);
      if (!res.ok) {
        toast.error("Clean up failed", res.error);
        return;
      }
      const count = res.data.archived.length;
      toast.success(
        count ? `Archived ${pluralize(count, "task")}` : "Nothing to clean up",
        count ? res.data.archived.join(", ") : `No ${names} tasks older than ${pluralize(n, "day")}.`,
      );
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Clean up finished tasks"
      description={`Archives ${names} tasks (with their sub-tasks) last updated more than this many days ago${space ? " in this Space" : " in every Space"}. You can restore them from the Archive.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={pending} disabled={!valid}>
            Archive
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <Field label="Older than (days)" htmlFor="cleanup-days" error={valid ? undefined : "Enter a whole number of days."}>
          <Input
            id="cleanup-days"
            type="number"
            min={0}
            max={3650}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={!valid || undefined}
          />
        </Field>
      </form>
    </Dialog>
  );
}
