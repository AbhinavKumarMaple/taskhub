/**
 * Pure board helpers (no React): container ids, grouping cards into lanes × columns, working out where a
 * dropped card landed, and applying a move optimistically. Shared by the client board and its tests.
 */
import type { TaskSummary } from "@/lib/types";

/** Lane key when swimlanes are off. */
export const ALL_LANE = "all";
/** Lane key for tasks without a milestone. */
export const NO_MILESTONE = "none";

const SEP = "|";

export function containerId(lane: string, status: string): string {
  return `${lane}${SEP}${status}`;
}

export function parseContainerId(id: string): { lane: string; status: string } {
  const i = id.indexOf(SEP);
  return { lane: id.slice(0, i), status: id.slice(i + 1) };
}

export type Lane = { key: string; title: string; ref: string | null };

/** Which lane a task belongs to. */
export function laneOf(t: Pick<TaskSummary, "milestone">, grouped: boolean): string {
  if (!grouped) return ALL_LANE;
  return t.milestone?.ref ?? NO_MILESTONE;
}

/** Cards by ordinal (then ref, for ties). */
export function byOrdinal(a: Pick<TaskSummary, "ordinal" | "ref">, b: Pick<TaskSummary, "ordinal" | "ref">) {
  return a.ordinal - b.ordinal || a.ref.localeCompare(b.ref, undefined, { numeric: true });
}

/**
 * Group refs into containers: one per lane × status. Every lane/status pair exists (possibly empty), so
 * empty columns are drop targets. Tasks whose status is not a column go nowhere (should not happen).
 */
export function buildContainers(
  tasks: TaskSummary[],
  statuses: string[],
  lanes: Lane[],
  grouped: boolean,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of lanes) for (const s of statuses) out[containerId(l.key, s)] = [];
  const sorted = [...tasks].sort(byOrdinal);
  for (const t of sorted) {
    const id = containerId(laneOf(t, grouped), t.status);
    out[id]?.push(t.ref);
  }
  return out;
}

/** Lanes for swimlane mode: milestones in the given order, then "No milestone". */
export function buildLanes(
  grouped: boolean,
  milestones: { ref: string; title: string }[],
  tasks: TaskSummary[],
  milestoneFilter?: string,
): Lane[] {
  if (!grouped) return [{ key: ALL_LANE, title: "", ref: null }];
  const lanes: Lane[] = [];
  const seen = new Set<string>();
  const add = (ref: string, title: string) => {
    if (seen.has(ref)) return;
    seen.add(ref);
    lanes.push({ key: ref, title, ref });
  };
  const filter = milestoneFilter?.toUpperCase();
  if (filter !== NO_MILESTONE.toUpperCase()) {
    for (const m of milestones) if (!filter || m.ref === filter) add(m.ref, m.title);
    // milestones referenced by tasks but not in the list (e.g. archived)
    for (const t of tasks) if (t.milestone && (!filter || t.milestone.ref === filter)) add(t.milestone.ref, t.milestone.title);
  }
  if (!filter || filter === NO_MILESTONE.toUpperCase()) lanes.push({ key: NO_MILESTONE, title: "No milestone", ref: null });
  return lanes;
}

/** Which container holds `id` (a ref or a container id). */
export function findContainer(items: Record<string, string[]>, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((k) => items[k].includes(id));
}

/**
 * Move `ref` into `toContainer` at `index` (clamped). Returns a new record; the input is not changed.
 */
export function moveBetween(
  items: Record<string, string[]>,
  ref: string,
  toContainer: string,
  index: number,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(items)) out[k] = v.filter((r) => r !== ref);
  const list = out[toContainer] ?? [];
  const i = Math.max(0, Math.min(index, list.length));
  out[toContainer] = [...list.slice(0, i), ref, ...list.slice(i)];
  return out;
}

export type Placement = {
  ref: string;
  status: string;
  lane: string;
  /** Card now directly below (move above it). */
  beforeRef?: string;
  /** Card now directly above (move below it). */
  afterRef?: string;
};

/** Where `ref` ended up in `items`, as a moveTask-style placement. */
export function placementOf(items: Record<string, string[]>, ref: string): Placement | null {
  const c = findContainer(items, ref);
  if (!c || c === ref) return null;
  const list = items[c];
  const i = list.indexOf(ref);
  const { lane, status } = parseContainerId(c);
  return {
    ref,
    status,
    lane,
    afterRef: i > 0 ? list[i - 1] : undefined,
    beforeRef: i < list.length - 1 ? list[i + 1] : undefined,
  };
}

/** True when the card sits in the same container with the same neighbours as before. */
export function samePlacement(a: Placement | null, b: Placement | null): boolean {
  if (!a || !b) return a === b;
  return a.status === b.status && a.lane === b.lane && a.afterRef === b.afterRef && a.beforeRef === b.beforeRef;
}

/** An ordinal between the neighbours (what the server will roughly pick). */
export function optimisticOrdinal(
  tasks: Pick<TaskSummary, "ref" | "ordinal">[],
  p: Pick<Placement, "afterRef" | "beforeRef">,
  fallback: number,
): number {
  const ord = (r?: string) => (r ? tasks.find((t) => t.ref === r)?.ordinal : undefined);
  const a = ord(p.afterRef);
  const b = ord(p.beforeRef);
  if (a !== undefined && b !== undefined) return (a + b) / 2;
  if (a !== undefined) return a + 1;
  if (b !== undefined) return b - 1;
  return fallback;
}

export type MoveAction = {
  ref: string;
  status: string;
  ordinal: number;
  /** undefined = milestone unchanged; null = cleared. */
  milestone?: { ref: string; title: string } | null;
  /** Reason given for a move into Blocked/Cancelled. */
  reason?: string;
};

/** useOptimistic reducer: apply a move to the task list. */
export function applyMove(tasks: TaskSummary[], m: MoveAction): TaskSummary[] {
  return tasks.map((t) =>
    t.ref === m.ref
      ? {
          ...t,
          status: m.status,
          ordinal: m.ordinal,
          ...(m.status !== t.status ? { statusReason: m.reason ?? "", statusChangedAt: new Date() } : {}),
          ...(m.milestone !== undefined ? { milestone: m.milestone } : {}),
        }
      : t,
  );
}

/**
 * Keyboard focus target: from (column, index) move by an arrow key across the visible grid of columns
 * (`cols` = card counts per column, left to right). Returns null when there is nowhere to go.
 */
export function arrowTarget(
  cols: number[],
  col: number,
  index: number,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
): { col: number; index: number } | null {
  if (key === "ArrowUp") return index > 0 ? { col, index: index - 1 } : null;
  if (key === "ArrowDown") return index < cols[col] - 1 ? { col, index: index + 1 } : null;
  const step = key === "ArrowLeft" ? -1 : 1;
  for (let c = col + step; c >= 0 && c < cols.length; c += step) {
    if (cols[c] > 0) return { col: c, index: Math.min(index, cols[c] - 1) };
  }
  return null;
}
