import { and, asc, desc, eq, gt, inArray, isNull, lt, max, min, notInArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "../db";
import {
  activity,
  attachments,
  checklistItems,
  comments,
  milestones,
  spaces,
  statusEvents,
  taskDependencies,
  tasks,
  type FieldChanges,
  type TaskRow,
} from "../db/schema";
import { Conflict, Invalid, NotFound } from "../errors";
import {
  cleanupDoneInput,
  commentInput,
  createTaskInput,
  listTasksInput,
  moveTaskInput,
  parse,
  reorderTasksInput,
  taskRef as taskRefSchema,
  updateTaskInput,
  type CreateTaskInput,
  type ListTasksInput,
  type MoveTaskInput,
  type UpdateTaskInput,
} from "../validation";
import type {
  Access,
  Activity,
  Attachment,
  ChecklistItem,
  Comment,
  DepNode,
  Settings,
  StatusEvent,
  TaskFull,
  TaskList,
  TaskLite,
  TaskSummary,
} from "@/lib/types";
import {
  allWordsMatch,
  archivedFilter,
  assertSpace,
  diff,
  logActivity,
  resolveCreateSpace,
  rowsOf,
  spaceRefCols,
  spaceScope,
  toSpaceRef,
  withTx,
} from "./context";
import { loadSettings } from "./settings";
import { fieldList } from "@/lib/field-labels";

const STEP = 1024;
const parentT = alias(tasks, "parent_t");

// ── Loading ──────────────────────────────────────────────────────────────────

/** A task by ref inside the caller's Spaces, or NotFound. */
export async function loadTask(q: DbOrTx, access: Access, ref: string): Promise<TaskRow> {
  const r = parse(taskRefSchema, ref);
  const [row] = await q.select().from(tasks).where(eq(tasks.ref, r));
  if (!row) throw new NotFound(`Task ${r} not found`);
  assertSpace(access, row.spaceId, `Task ${r} not found`);
  return row;
}

async function loadTasks(q: DbOrTx, access: Access, refs: string[]): Promise<TaskRow[]> {
  const clean = [...new Set(refs.map((r) => parse(taskRefSchema, r)))];
  if (!clean.length) return [];
  const rows = await q.select().from(tasks).where(inArray(tasks.ref, clean));
  for (const r of clean) {
    const row = rows.find((x) => x.ref === r);
    if (!row) throw new NotFound(`Task ${r} not found`);
    assertSpace(access, row.spaceId, `Task ${r} not found`);
  }
  return clean.map((r) => rows.find((x) => x.ref === r)!);
}

const summaryFields = {
  t: tasks,
  sp: spaceRefCols,
  parentRef: parentT.ref,
  msRef: milestones.ref,
  msTitle: milestones.title,
};

function baseSelect(q: DbOrTx) {
  return q
    .select(summaryFields)
    .from(tasks)
    .innerJoin(spaces, eq(spaces.id, tasks.spaceId))
    .leftJoin(parentT, eq(parentT.id, tasks.parentId))
    .leftJoin(milestones, eq(milestones.id, tasks.milestoneId));
}

type SummaryRow = {
  t: TaskRow;
  sp: { id: string; name: string; color: string };
  parentRef: string | null;
  msRef: string | null;
  msTitle: string | null;
};

async function summarize(q: DbOrTx, rows: SummaryRow[], settings: Settings): Promise<TaskSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.t.id);
  const [checks, kids] = await Promise.all([
    q
      .select({
        taskId: checklistItems.taskId,
        list: checklistItems.list,
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${checklistItems.checked}))::int`,
      })
      .from(checklistItems)
      .where(inArray(checklistItems.taskId, ids))
      .groupBy(checklistItems.taskId, checklistItems.list),
    q
      .select({ parentId: tasks.parentId, status: tasks.status, n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(inArray(tasks.parentId, ids), isNull(tasks.archivedAt)))
      .groupBy(tasks.parentId, tasks.status),
  ]);
  return rows.map(({ t, sp, parentRef, msRef, msTitle }) => {
    const ac = checks.find((c) => c.taskId === t.id && c.list === "ac");
    const dod = checks.find((c) => c.taskId === t.id && c.list === "dod");
    const childCounts: Record<string, number> = {};
    let childTotal = 0;
    for (const k of kids) {
      if (k.parentId !== t.id) continue;
      childCounts[k.status] = k.n;
      childTotal += k.n;
    }
    return {
      id: t.id,
      ref: t.ref,
      space: toSpaceRef(sp),
      parentRef,
      isDraft: t.isDraft,
      title: t.title,
      status: t.status,
      statusReason: t.statusReason,
      statusChangedAt: t.statusChangedAt,
      type: t.type,
      priority: t.priority,
      labels: t.labels,
      assignees: t.assignees,
      milestone: msRef ? { ref: msRef, title: msTitle ?? "" } : null,
      dueDate: t.dueDate,
      ordinal: t.ordinal,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      archivedAt: t.archivedAt,
      acDone: ac?.done ?? 0,
      acTotal: ac?.total ?? 0,
      dodDone: dod?.done ?? 0,
      dodTotal: dod?.total ?? 0,
      childCounts,
      childTotal,
      childDone: settings.closedStatuses.reduce((n, st) => n + (childCounts[st] ?? 0), 0),
    };
  });
}

/** Summaries for task ids, in the given order. */
export async function summariesByIds(q: DbOrTx, ids: number[], settings?: Settings): Promise<TaskSummary[]> {
  if (!ids.length) return [];
  const s = settings ?? (await loadSettings(q));
  const rows = await baseSelect(q).where(inArray(tasks.id, ids));
  const out = await summarize(q, rows, s);
  return ids.map((id) => out.find((x) => x.id === id)).filter((x): x is TaskSummary => !!x);
}

function lite(t: Pick<TaskRow, "ref" | "title" | "status" | "type" | "archivedAt">): TaskLite {
  return { ref: t.ref, title: t.title, status: t.status, type: t.type, archivedAt: t.archivedAt };
}

const arrayLiteral = (vals: string[]) =>
  vals.length ? sql`ARRAY[${sql.join(vals.map((v) => sql`${v}::text`), sql`, `)}]` : sql`ARRAY[]::text[]`;

const refSortKey = sql`string_to_array(substring(${tasks.ref} from 3), '.')::int[]`;

// ── Listing ──────────────────────────────────────────────────────────────────

function listWhere(access: Access, p: ReturnType<typeof listTasksInput.parse>): SQL | undefined {
  const conds: (SQL | undefined)[] = [spaceScope(access, tasks.spaceId, p.spaces)];
  if (p.status?.length) conds.push(inArray(tasks.status, p.status));
  if (p.excludeStatus?.length) conds.push(notInArray(tasks.status, p.excludeStatus));
  if (p.type?.length) conds.push(inArray(tasks.type, p.type));
  if (p.labels?.length) conds.push(sql`${tasks.labels} @> ${arrayLiteral(p.labels)}`);
  if (p.priority?.length) conds.push(inArray(tasks.priority, p.priority));
  if (p.assignee) conds.push(sql`${p.assignee}::text = any(${tasks.assignees})`);
  if (p.milestone) {
    conds.push(p.milestone.toLowerCase() === "none" ? isNull(tasks.milestoneId) : eq(milestones.ref, p.milestone.toUpperCase()));
  }
  if (p.parent) conds.push(eq(parentT.ref, p.parent));
  if (p.topLevelOnly) conds.push(isNull(tasks.parentId));
  conds.push(allWordsMatch(p.q, [tasks.ref, tasks.title, tasks.description, tasks.notes]));
  conds.push(archivedFilter(tasks.archivedAt, p));
  const drafts = p.drafts ?? "exclude";
  if (drafts === "exclude") conds.push(eq(tasks.isDraft, false));
  if (drafts === "only") conds.push(eq(tasks.isDraft, true));
  return and(...conds);
}

function orderBy(p: ReturnType<typeof listTasksInput.parse>, settings: Settings): SQL[] {
  const dir = (e: SQL | typeof tasks.ordinal) => (p.order === "desc" ? sql`${e} desc nulls last` : sql`${e} asc nulls last`);
  const sort = p.sort ?? "ordinal";
  const key: Record<typeof sort, SQL> = {
    ordinal: sql`${tasks.ordinal}`,
    ref: refSortKey,
    title: sql`lower(${tasks.title})`,
    status: sql`array_position(${arrayLiteral(settings.statuses)}, ${tasks.status})`,
    type: sql`array_position(${arrayLiteral(settings.types)}, ${tasks.type})`,
    priority: sql`array_position(${arrayLiteral(settings.priorities)}, ${tasks.priority})`,
    space: sql`lower(${spaces.name})`,
    milestone: sql`${milestones.ref}`,
    ac: sql`(select (count(*) filter (where c.checked))::float / nullif(count(*), 0) from ${checklistItems} c where c.task_id = ${tasks.id} and c.list = 'ac')`,
    created: sql`${tasks.createdAt}`,
    updated: sql`${tasks.updatedAt}`,
  };
  return [dir(key[sort]), sort === "ref" ? sql`${tasks.id} asc` : refSortKey];
}

/**
 * Tasks in the caller's Spaces. Defaults: drafts excluded, archived excluded, archived Spaces excluded
 * unless asked for by id, sort by board ordinal, limit 100.
 */
export async function listTasks(access: Access, filters: ListTasksInput = {}): Promise<TaskList> {
  const p = parse(listTasksInput, filters);
  const q = await getDb();
  const settings = await loadSettings(q);
  const where = listWhere(access, p);
  const [rows, [{ n }]] = await Promise.all([
    baseSelect(q)
      .where(where)
      .orderBy(...orderBy(p, settings))
      .limit(p.limit ?? 100)
      .offset(p.offset ?? 0),
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(spaces, eq(spaces.id, tasks.spaceId))
      .leftJoin(parentT, eq(parentT.id, tasks.parentId))
      .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(where),
  ]);
  return { items: await summarize(q, rows, settings), total: n };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

async function spaceEdges(q: DbOrTx, spaceId: string) {
  return q
    .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(eq(tasks.spaceId, spaceId));
}

function adjacency(edges: { taskId: number; dependsOnId: number }[], reverse = false) {
  const m = new Map<number, number[]>();
  for (const e of edges) {
    const [a, b] = reverse ? [e.dependsOnId, e.taskId] : [e.taskId, e.dependsOnId];
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push(b);
  }
  return m;
}

/** Path from `from` to `to` following edges, or null. */
function findPath(adj: Map<number, number[]>, from: number, to: number): number[] | null {
  const stack: [number, number[]][] = [[from, [from]]];
  const seen = new Set<number>();
  while (stack.length) {
    const [n, path] = stack.pop()!;
    if (n === to) return path;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adj.get(n) ?? []) stack.push([m, [...path, m]]);
  }
  return null;
}

function depTree(adj: Map<number, number[]>, root: number, byId: Map<number, TaskRow>): DepNode[] {
  const out: DepNode[] = [];
  const seen = new Set<number>([root]);
  const walk = (id: number, depth: number, via: string | null) => {
    for (const next of adj.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const t = byId.get(next);
      if (!t) continue;
      out.push({ ...lite(t), depth, via });
      if (depth < 25) walk(next, depth + 1, t.ref);
    }
  };
  walk(root, 1, null);
  return out;
}

async function addDeps(q: DbOrTx, access: Access, task: TaskRow, refs: string[]): Promise<string[]> {
  const targets = await loadTasks(q, access, refs);
  const edges = await spaceEdges(q, task.spaceId);
  const adj = adjacency(edges);
  const added: string[] = [];
  const all = await q
    .select({ id: tasks.id, ref: tasks.ref })
    .from(tasks)
    .where(eq(tasks.spaceId, task.spaceId));
  const refOf = (id: number) => all.find((x) => x.id === id)?.ref ?? `#${id}`;
  for (const d of targets) {
    if (d.id === task.id) throw new Invalid(`${task.ref} cannot depend on itself`);
    if (d.spaceId !== task.spaceId) throw new Invalid(`${d.ref} is in another Space; dependencies must be in the same Space`);
    if ((adj.get(task.id) ?? []).includes(d.id)) continue;
    const back = findPath(adj, d.id, task.id);
    if (back) {
      throw new Invalid(`Adding ${d.ref} would create a cycle: ${[task.id, ...back].map(refOf).join(" → ")}`);
    }
    await q.insert(taskDependencies).values({ taskId: task.id, dependsOnId: d.id }).onConflictDoNothing();
    if (!adj.has(task.id)) adj.set(task.id, []);
    adj.get(task.id)!.push(d.id);
    added.push(d.ref);
  }
  return added;
}

async function removeDeps(q: DbOrTx, access: Access, task: TaskRow, refs: string[]): Promise<string[]> {
  const targets = await loadTasks(q, access, refs);
  const removed: string[] = [];
  for (const d of targets) {
    const r = await q
      .delete(taskDependencies)
      .where(and(eq(taskDependencies.taskId, task.id), eq(taskDependencies.dependsOnId, d.id)))
      .returning();
    if (r.length) removed.push(d.ref);
  }
  return removed;
}

async function directDepRefs(q: DbOrTx, taskId: number): Promise<string[]> {
  const rows = await q
    .select({ ref: tasks.ref })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
    .where(eq(taskDependencies.taskId, taskId))
    .orderBy(refSortKey);
  return rows.map((r) => r.ref);
}

// ── Detail ───────────────────────────────────────────────────────────────────

async function loadFull(q: DbOrTx, access: Access, ref: string): Promise<TaskFull> {
  const t = await loadTask(q, access, ref);
  const settings = await loadSettings(q);
  const [[summary], checks, childRows, parentRow, edges, commentRows, activityRows, trailRows, fileRows] = await Promise.all([
    summariesByIds(q, [t.id], settings),
    q.select().from(checklistItems).where(eq(checklistItems.taskId, t.id)).orderBy(asc(checklistItems.position), asc(checklistItems.id)),
    baseSelect(q).where(eq(tasks.parentId, t.id)).orderBy(refSortKey),
    t.parentId ? q.select().from(tasks).where(eq(tasks.id, t.parentId)) : Promise.resolve([] as TaskRow[]),
    spaceEdges(q, t.spaceId),
    q.select().from(comments).where(eq(comments.taskId, t.id)).orderBy(asc(comments.createdAt), asc(comments.id)),
    // Only history recorded in Spaces the caller holds: after a Space move, rows from the old Space
    // (old field values, old Space id) stay hidden from a chat that holds only the new one.
    q
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.entityRef, t.ref),
          access.spaces === "all" ? undefined : inArray(activity.spaceId, access.spaces),
        ),
      )
      .orderBy(desc(activity.id))
      .limit(100),
    // Same rule as activity: trail steps recorded in Spaces the caller does not hold stay hidden.
    q
      .select()
      .from(statusEvents)
      .where(
        and(
          eq(statusEvents.taskId, t.id),
          access.spaces === "all" ? undefined : inArray(statusEvents.spaceId, access.spaces),
        ),
      )
      .orderBy(asc(statusEvents.id)),
    q.select(attachmentMetaCols).from(attachments).where(eq(attachments.taskId, t.id)).orderBy(asc(attachments.id)),
  ]);
  const involved = new Set<number>();
  for (const e of edges) {
    involved.add(e.taskId);
    involved.add(e.dependsOnId);
  }
  const depRows = involved.size
    ? await q.select().from(tasks).where(inArray(tasks.id, [...involved]))
    : [];
  const byId = new Map(depRows.map((r) => [r.id, r]));
  const item = (c: typeof checklistItems.$inferSelect): ChecklistItem => ({
    id: c.id,
    text: c.text,
    checked: c.checked,
    position: c.position,
  });
  return {
    ...summary,
    description: t.description,
    plan: t.plan,
    notes: t.notes,
    finalSummary: t.finalSummary,
    references: t.references,
    documentation: t.documentation,
    modifiedFiles: t.modifiedFiles,
    acceptanceCriteria: checks.filter((c) => c.list === "ac").map(item),
    definitionOfDone: checks.filter((c) => c.list === "dod").map(item),
    parent: parentRow[0] ? lite(parentRow[0]) : null,
    children: await summarize(q, childRows, settings),
    dependsOn: depTree(adjacency(edges), t.id, byId),
    blocks: depTree(adjacency(edges, true), t.id, byId),
    comments: commentRows.map(
      (c): Comment => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt }),
    ),
    statusHistory: trailRows.map(
      (e): StatusEvent => ({ id: e.id, from: e.fromStatus, to: e.toStatus, reason: e.reason, actor: e.actor, createdAt: e.createdAt }),
    ),
    attachments: fileRows.map((a) => toAttachment(t.ref, a)),
    activity: activityRows as Activity[],
  };
}

/** Attachment columns without the bytes. */
export const attachmentMetaCols = {
  id: attachments.id,
  filename: attachments.filename,
  contentType: attachments.contentType,
  size: attachments.size,
  width: attachments.width,
  height: attachments.height,
  caption: attachments.caption,
  actor: attachments.actor,
  createdAt: attachments.createdAt,
};

export function toAttachment(ref: string, a: Omit<Attachment, "url">): Attachment {
  return { ...a, url: `/api/v1/tasks/${ref}/attachments/${a.id}` };
}

/** Full task: checklists, children, deps both ways (transitive), comments, activity. */
export async function getTask(access: Access, ref: string): Promise<TaskFull> {
  return loadFull(await getDb(), access, ref);
}

// ── Helpers for writes ───────────────────────────────────────────────────────

function checkVocab(settings: Settings, v: { status?: string; type?: string; priority?: string | null }) {
  if (v.status !== undefined && !settings.statuses.includes(v.status))
    throw new Invalid(`Unknown status "${v.status}". Use one of: ${settings.statuses.join(", ")}`);
  if (v.type !== undefined && !settings.types.includes(v.type))
    throw new Invalid(`Unknown type "${v.type}". Use one of: ${settings.types.join(", ")}`);
  if (v.priority !== undefined && v.priority !== null && !settings.priorities.includes(v.priority))
    throw new Invalid(`Unknown priority "${v.priority}". Use one of: ${settings.priorities.join(", ")}`);
}

type StatusSet = Pick<Partial<typeof tasks.$inferInsert>, "status" | "statusReason" | "statusChangedAt">;

/**
 * Validates a status change (or a reason edit) and writes the trail step. Moving into a reason status
 * (Blocked, Cancelled) needs a reason. Returns the task columns to set ({} when nothing changes).
 * `cur` null = a new task getting its first status.
 */
async function applyStatus(
  tx: DbOrTx,
  access: Access,
  settings: Settings,
  task: { id: number; spaceId: string },
  cur: { status: string; statusReason: string } | null,
  to: string,
  reason: string | undefined,
): Promise<StatusSet> {
  const why = (reason ?? "").trim();
  const changed = !cur || cur.status !== to;
  if (changed && settings.reasonStatuses.includes(to) && !why)
    throw new Invalid(`Moving to "${to}" needs a reason: send "reason" with the status (what stopped it, or why it was dropped)`);
  if (!changed && (reason === undefined || why === cur.statusReason)) return {};
  await tx.insert(statusEvents).values({
    taskId: task.id,
    spaceId: task.spaceId,
    fromStatus: cur ? cur.status : null,
    toStatus: to,
    reason: why,
    actor: access.actor || "chat",
  });
  return changed ? { status: to, statusReason: why, statusChangedAt: new Date() } : { statusReason: why };
}

/** " — reason" for activity summaries. */
const because = (why: string | undefined) => {
  const w = (why ?? "").trim();
  return w ? ` — ${w.length > 120 ? w.slice(0, 117) + "…" : w}` : "";
};

async function resolveMilestone(q: DbOrTx, access: Access, ref: string | null | undefined, spaceId: string) {
  if (ref === undefined) return undefined;
  if (ref === null) return null;
  const [m] = await q.select().from(milestones).where(eq(milestones.ref, ref));
  if (!m) throw new NotFound(`Milestone ${ref} not found`);
  assertSpace(access, m.spaceId, `Milestone ${ref} not found`);
  if (m.spaceId !== spaceId) throw new Invalid(`Milestone ${ref} belongs to another Space`);
  return m;
}

/**
 * Board order is kept per Space: the ordinal helpers below only ever read or write cards of one Space,
 * so a chat can neither learn other Spaces' card positions nor renumber their cards.
 */
async function endOfColumn(q: DbOrTx, spaceId: string, status: string): Promise<number> {
  const [r] = await q
    .select({ m: max(tasks.ordinal) })
    .from(tasks)
    .where(and(eq(tasks.spaceId, spaceId), eq(tasks.status, status), isNull(tasks.archivedAt)));
  return (r?.m ?? 0) + STEP;
}

const uniq = (a: string[]) => [...new Set(a)];

type Item = { text: string; checked: boolean };
type ChecklistOps = {
  add?: string[];
  check?: number[];
  uncheck?: number[];
  remove?: number[];
  edit?: { index: number; text: string }[];
  set?: string[];
  reorder?: number[];
};

/**
 * Applies checklist ops. Order: set (replace, keeping checks on identical text), then edit/check/uncheck/
 * reorder/remove by 1-based index into the list as it stood after `set`, then add (appended).
 */
export function applyChecklistOps(current: Item[], ops: ChecklistOps, label: string): Item[] {
  let base: Item[] = current.map((c) => ({ ...c }));
  if (ops.set) {
    const pool = [...base];
    base = ops.set.map((text) => {
      const i = pool.findIndex((p) => p.text.trim() === text.trim());
      const checked = i >= 0 ? pool[i].checked : false;
      if (i >= 0) pool.splice(i, 1);
      return { text, checked };
    });
  }
  const items = base.map((it, i) => ({ ...it, idx: i + 1 }));
  const get = (n: number) => {
    const it = items.find((x) => x.idx === n);
    if (!it) throw new Invalid(`${label} #${n} does not exist (there are ${items.length})`);
    return it;
  };
  for (const e of ops.edit ?? []) get(e.index).text = e.text;
  for (const n of ops.check ?? []) get(n).checked = true;
  for (const n of ops.uncheck ?? []) get(n).checked = false;
  let ordered = items;
  if (ops.reorder) {
    const perm = ops.reorder;
    if (perm.length !== items.length || new Set(perm).size !== perm.length)
      throw new Invalid(`${label} reorder must list every item once (${items.length} items)`);
    ordered = perm.map((n) => get(n));
  }
  const removeSet = new Set((ops.remove ?? []).map((n) => get(n).idx));
  const out: Item[] = ordered.filter((x) => !removeSet.has(x.idx)).map(({ text, checked }) => ({ text, checked }));
  for (const text of ops.add ?? []) out.push({ text, checked: false });
  return out;
}

const fmtList = (items: Item[]) => items.map((i) => `[${i.checked ? "x" : " "}] ${i.text}`);

async function writeChecklist(q: DbOrTx, taskId: number, list: "ac" | "dod", items: Item[]) {
  await q.delete(checklistItems).where(and(eq(checklistItems.taskId, taskId), eq(checklistItems.list, list)));
  if (items.length)
    await q
      .insert(checklistItems)
      .values(items.map((it, i) => ({ taskId, list, text: it.text, checked: it.checked, position: i + 1 })));
}

async function readChecklist(q: DbOrTx, taskId: number, list: "ac" | "dod"): Promise<Item[]> {
  const rows = await q
    .select({ text: checklistItems.text, checked: checklistItems.checked })
    .from(checklistItems)
    .where(and(eq(checklistItems.taskId, taskId), eq(checklistItems.list, list)))
    .orderBy(asc(checklistItems.position), asc(checklistItems.id));
  return rows;
}

const appendText = (cur: string, add: string) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n\n${add}` : add);

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a task (or a draft). With `parent`, it becomes `<parent>.<k>` in the parent's Space.
 * Type defaults to "sub-feature" for children (if configured), else the first type.
 */
export async function createTask(access: Access, input: CreateTaskInput): Promise<TaskFull> {
  const p = parse(createTaskInput, input);
  const ref = await withTx(async (tx) => {
    const settings = await loadSettings(tx);
    let spaceId: string;
    let parentRow: TaskRow | null = null;
    if (p.parent) {
      parentRow = await loadTask(tx, access, p.parent);
      if (p.spaceId && p.spaceId !== parentRow.spaceId)
        throw new Invalid("A child always lives in its parent's Space");
      spaceId = parentRow.spaceId;
    } else {
      spaceId = resolveCreateSpace(access, p.spaceId);
      const [sp] = await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId));
      if (!sp) throw new NotFound("Space not found");
    }
    const type =
      p.type ?? (parentRow && settings.types.includes("sub-feature") ? "sub-feature" : settings.types[0]);
    const status = p.status ?? settings.defaultStatus;
    checkVocab(settings, { status, type, priority: p.priority });
    const ms = await resolveMilestone(tx, access, p.milestone, spaceId);

    let ref: string;
    if (parentRow) {
      const [u] = await tx
        .update(tasks)
        .set({ childCounter: sql`${tasks.childCounter} + 1` })
        .where(eq(tasks.id, parentRow.id))
        .returning({ n: tasks.childCounter });
      ref = `${parentRow.ref}.${u.n}`;
    } else {
      const res = await tx.execute(sql`select nextval('task_ref_seq') as n`);
      const n = rowsOf<{ n: string | number }>(res)[0].n;
      ref = `T-${Number(n)}`;
    }

    if (settings.reasonStatuses.includes(status) && !(p.reason ?? "").trim())
      throw new Invalid(`Creating a task in "${status}" needs a reason: send "reason"`);
    const [row] = await tx
      .insert(tasks)
      .values({
        ref,
        spaceId,
        statusReason: (p.reason ?? "").trim(),
        parentId: parentRow?.id ?? null,
        isDraft: p.isDraft ?? false,
        title: p.title,
        description: p.description ?? "",
        status,
        type,
        priority: p.priority ?? null,
        labels: uniq(p.labels ?? []),
        assignees: uniq(p.assignees ?? []),
        milestoneId: ms ? ms.id : null,
        dueDate: p.dueDate ?? null,
        plan: p.plan ?? "",
        notes: p.notes ?? "",
        finalSummary: p.finalSummary ?? "",
        references: p.references ?? [],
        documentation: p.documentation ?? [],
        modifiedFiles: p.modifiedFiles ?? [],
        ordinal: await endOfColumn(tx, spaceId, status),
      })
      .returning();

    await applyStatus(tx, access, settings, row, null, status, p.reason);
    await writeChecklist(tx, row.id, "ac", (p.acceptanceCriteria ?? []).map((text) => ({ text, checked: false })));
    const dod = [...(p.noDodDefaults ? [] : settings.dodDefaults), ...(p.definitionOfDone ?? [])];
    await writeChecklist(tx, row.id, "dod", dod.map((text) => ({ text, checked: false })));
    if (p.dependsOn?.length) await addDeps(tx, access, row, p.dependsOn);

    const changes: FieldChanges = {
      title: { from: null, to: row.title },
      status: { from: null, to: status },
      type: { from: null, to: type },
    };
    if (row.priority) changes.priority = { from: null, to: row.priority };
    if (row.labels.length) changes.labels = { from: null, to: row.labels };
    if (row.statusReason) changes.statusReason = { from: null, to: row.statusReason };
    await logActivity(tx, access, {
      spaceId,
      entityType: "task",
      entityRef: ref,
      action: "created",
      summary: `Created ${p.isDraft ? "draft " : ""}${type} ${ref} "${row.title}"${parentRow ? ` under ${parentRow.ref}` : ""}${status !== settings.defaultStatus ? ` in ${status}${because(p.reason)}` : ""}`,
      changes,
    });
    return ref;
  });
  return getTask(access, ref);
}

// ── Update ───────────────────────────────────────────────────────────────────

const SCALARS = [
  "title",
  "description",
  "type",
  "priority",
  "labels",
  "assignees",
  "dueDate",
  "plan",
  "notes",
  "finalSummary",
  "references",
  "documentation",
  "modifiedFiles",
] as const;

/** Update any field and/or apply list ops (AC, DoD, labels, deps, notes/plan appends). */
export async function updateTask(access: Access, ref: string, input: UpdateTaskInput): Promise<TaskFull> {
  const p = parse(updateTaskInput, input);
  const finalRef = await withTx(async (tx) => {
    let cur = await loadTask(tx, access, ref);
    if (p.parent !== undefined) {
      if (p.spaceId && p.spaceId !== cur.spaceId)
        throw new Invalid("Change the Space and the parent in separate edits");
      cur = await reparent(tx, access, cur, p.parent);
    }
    const settings = await loadSettings(tx);
    checkVocab(settings, { status: p.status, type: p.type, priority: p.priority });

    const next: Partial<Record<(typeof SCALARS)[number], unknown>> = {};
    for (const k of SCALARS) if (p[k] !== undefined) next[k] = p[k];
    if (p.labels) next.labels = uniq(p.labels);
    if (p.assignees) next.assignees = uniq(p.assignees);
    if (p.appendNotes) next.notes = appendText((next.notes as string) ?? cur.notes, p.appendNotes);
    if (p.appendPlan) next.plan = appendText((next.plan as string) ?? cur.plan, p.appendPlan);
    if (p.addLabels || p.removeLabels) {
      const base = (next.labels as string[]) ?? cur.labels;
      next.labels = uniq([...base, ...(p.addLabels ?? [])]).filter((l) => !(p.removeLabels ?? []).includes(l));
    }

    const changes: FieldChanges = diff(cur as unknown as Record<string, unknown>, next);
    const set: Partial<typeof tasks.$inferInsert> = {};
    for (const k of Object.keys(changes)) (set as Record<string, unknown>)[k] = next[k as keyof typeof next];

    // Space move (top-level only; descendants follow)
    let targetSpace = cur.spaceId;
    if (p.spaceId && p.spaceId !== cur.spaceId) {
      if (cur.parentId) throw new Invalid("Only top-level tasks can move Space; a child lives in its parent's Space");
      assertSpace(access, p.spaceId, "Space not found");
      const [sp] = await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, p.spaceId));
      if (!sp) throw new NotFound("Space not found");
      targetSpace = p.spaceId;
      changes.spaceId = { from: cur.spaceId, to: targetSpace };
    }

    // Milestone
    const ms = await resolveMilestone(tx, access, p.milestone, targetSpace);
    if (ms !== undefined) {
      const newId = ms ? ms.id : null;
      if (newId !== cur.milestoneId) {
        const [old] = cur.milestoneId
          ? await tx.select({ ref: milestones.ref }).from(milestones).where(eq(milestones.id, cur.milestoneId))
          : [];
        changes.milestone = { from: old?.ref ?? null, to: ms ? ms.ref : null };
        set.milestoneId = newId;
      }
    } else if (targetSpace !== cur.spaceId && cur.milestoneId) {
      const [old] = await tx.select({ ref: milestones.ref }).from(milestones).where(eq(milestones.id, cur.milestoneId));
      changes.milestone = { from: old?.ref ?? null, to: null };
      set.milestoneId = null;
    }

    if (targetSpace !== cur.spaceId) {
      const family = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(sql`${tasks.id} = ${cur.id} or ${tasks.ref} like ${cur.ref + ".%"}`);
      const ids = family.map((f) => f.id);
      await tx.update(tasks).set({ spaceId: targetSpace }).where(inArray(tasks.id, ids));
      // dependencies cannot cross Spaces; milestones of descendants too
      const idList = sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      );
      await tx.execute(
        sql`delete from task_dependencies d using tasks a, tasks b where d.task_id = a.id and d.depends_on_id = b.id and a.space_id <> b.space_id and (a.id in (${idList}) or b.id in (${idList}))`,
      );
      await tx
        .update(tasks)
        .set({ milestoneId: null })
        .where(
          and(
            inArray(tasks.id, ids),
            sql`${tasks.milestoneId} in (select id from ${milestones} where space_id <> ${targetSpace})`,
          ),
        );
    }

    // Checklists
    const acOps = {
      add: p.addAc,
      check: p.checkAc,
      uncheck: p.uncheckAc,
      remove: p.removeAc,
      edit: p.editAc,
      set: p.setAc,
      reorder: p.reorderAc,
    };
    const dodOps = {
      add: p.addDod,
      check: p.checkDod,
      uncheck: p.uncheckDod,
      remove: p.removeDod,
      edit: p.editDod,
      set: p.setDod,
      reorder: p.reorderDod,
    };
    for (const [list, ops, label, field] of [
      ["ac", acOps, "Acceptance criterion", "acceptanceCriteria"],
      ["dod", dodOps, "Definition of Done item", "definitionOfDone"],
    ] as const) {
      if (!Object.values(ops).some((v) => v !== undefined)) continue;
      const before = await readChecklist(tx, cur.id, list);
      const after = applyChecklistOps(before, ops, label);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await writeChecklist(tx, cur.id, list, after);
        changes[field] = { from: fmtList(before), to: fmtList(after) };
      }
    }

    // Dependencies
    if (p.addDeps?.length || p.removeDeps?.length) {
      const before = await directDepRefs(tx, cur.id);
      if (p.removeDeps?.length) await removeDeps(tx, access, cur, p.removeDeps);
      if (p.addDeps?.length) await addDeps(tx, access, { ...cur, spaceId: targetSpace }, p.addDeps);
      const after = await directDepRefs(tx, cur.id);
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.dependsOn = { from: before, to: after };
    }

    // Status + reason (validated, and written to the trail)
    if (p.status !== undefined || p.reason !== undefined) {
      const st = await applyStatus(tx, access, settings, { id: cur.id, spaceId: targetSpace }, cur, p.status ?? cur.status, p.reason);
      if (st.status !== undefined) changes.status = { from: cur.status, to: st.status };
      if (st.statusReason !== undefined && st.statusReason !== cur.statusReason)
        changes.statusReason = { from: cur.statusReason || null, to: st.statusReason || null };
      Object.assign(set, st);
    }

    if (!Object.keys(changes).length) return cur.ref;

    const statusChanged = !!changes.status;
    if (statusChanged || targetSpace !== cur.spaceId)
      set.ordinal = await endOfColumn(tx, targetSpace, p.status ?? cur.status);
    await tx
      .update(tasks)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(tasks.id, cur.id));
    const fields = Object.keys(changes);
    await logActivity(tx, access, {
      spaceId: targetSpace,
      entityType: "task",
      entityRef: cur.ref,
      action: statusChanged ? "status" : "updated",
      summary: statusChanged
        ? `${cur.ref} "${(next.title as string) ?? cur.title}": ${cur.status} → ${p.status}${because(p.reason)}${fields.some((f) => f !== "status" && f !== "statusReason") ? ` (also ${fieldList(fields.filter((f) => f !== "status" && f !== "statusReason"))})` : ""}`
        : changes.statusReason && fields.length === 1
          ? `${cur.ref} reason for ${cur.status}${because(p.reason) || ": cleared"}`
          : `Updated ${cur.ref} (${fieldList(fields)})`,
      changes,
    });
    return cur.ref;
  });
  return getTask(access, finalRef);
}

/**
 * Give a task a new parent (same Space) or make it top level. Refs encode the parent, so the task gets a
 * fresh ref (`<parent>.<k>` or `T-<n>`) and every descendant is renumbered with it; their activity rows
 * follow so history stays attached. Returns the updated row.
 */
async function reparent(tx: DbOrTx, access: Access, cur: TaskRow, parentRef: string | null): Promise<TaskRow> {
  const parent = parentRef === null ? null : await loadTask(tx, access, parentRef);
  if ((parent?.id ?? null) === cur.parentId) return cur;
  if (parent) {
    if (parent.id === cur.id || parent.ref.startsWith(`${cur.ref}.`))
      throw new Invalid(`${parent.ref} is ${cur.ref} or one of its subtasks; a task cannot be its own parent`);
    if (parent.spaceId !== cur.spaceId)
      throw new Invalid(`${parent.ref} is in another Space; move the task to that Space first`);
  }
  const [oldParent] = cur.parentId
    ? await tx.select({ ref: tasks.ref }).from(tasks).where(eq(tasks.id, cur.parentId))
    : [];

  let newRef: string;
  if (parent) {
    const [u] = await tx
      .update(tasks)
      .set({ childCounter: sql`${tasks.childCounter} + 1` })
      .where(eq(tasks.id, parent.id))
      .returning({ n: tasks.childCounter });
    newRef = `${parent.ref}.${u.n}`;
  } else {
    const res = await tx.execute(sql`select nextval('task_ref_seq') as n`);
    newRef = `T-${Number(rowsOf<{ n: string | number }>(res)[0].n)}`;
  }

  const oldRef = cur.ref;
  const prefix = `${oldRef}.`;
  const family = await tx
    .select({ id: tasks.id, ref: tasks.ref })
    .from(tasks)
    .where(sql`${tasks.id} = ${cur.id} or ${tasks.ref} like ${prefix + "%"}`);
  for (const f of family) {
    const next = f.id === cur.id ? newRef : newRef + f.ref.slice(oldRef.length);
    await tx.update(tasks).set({ ref: next }).where(eq(tasks.id, f.id));
  }
  await tx.update(tasks).set({ parentId: parent?.id ?? null, updatedAt: new Date() }).where(eq(tasks.id, cur.id));
  await tx
    .update(activity)
    .set({ entityRef: sql`${newRef}::text || substr(${activity.entityRef}, ${oldRef.length + 1}::int)` })
    .where(
      and(
        eq(activity.entityType, "task"),
        sql`(${activity.entityRef} = ${oldRef} or ${activity.entityRef} like ${prefix + "%"})`,
      ),
    );
  await logActivity(tx, access, {
    spaceId: cur.spaceId,
    entityType: "task",
    entityRef: newRef,
    action: "moved",
    summary: parent
      ? `Moved ${oldRef} under ${parent.ref}; it is now ${newRef}`
      : `Made ${oldRef} a top-level task; it is now ${newRef}`,
    changes: { parent: { from: oldParent?.ref ?? null, to: parent?.ref ?? null }, ref: { from: oldRef, to: newRef } },
  });
  return loadTask(tx, access, newRef);
}

// ── Board moves ──────────────────────────────────────────────────────────────

async function renumberColumn(q: DbOrTx, spaceId: string, status: string) {
  const rows = await q
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.spaceId, spaceId), eq(tasks.status, status), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.ordinal), asc(tasks.id));
  for (let i = 0; i < rows.length; i++) {
    await q.update(tasks).set({ ordinal: (i + 1) * STEP }).where(eq(tasks.id, rows[i].id));
  }
}

async function neighbour(
  q: DbOrTx,
  spaceId: string,
  status: string,
  ordinal: number,
  dir: "prev" | "next",
  exceptId: number,
) {
  const [r] = await q
    .select({ v: dir === "prev" ? max(tasks.ordinal) : min(tasks.ordinal) })
    .from(tasks)
    .where(
      and(
        eq(tasks.spaceId, spaceId),
        eq(tasks.status, status),
        isNull(tasks.archivedAt),
        sql`${tasks.id} <> ${exceptId}`,
        dir === "prev" ? lt(tasks.ordinal, ordinal) : gt(tasks.ordinal, ordinal),
      ),
    );
  return r?.v ?? null;
}

/** Drag and drop: set status and/or position (explicit ordinal, before/after a card, or end of column). */
export async function moveTask(access: Access, input: MoveTaskInput): Promise<TaskSummary> {
  const p = parse(moveTaskInput, input);
  const id = await withTx(async (tx) => {
    const cur = await loadTask(tx, access, p.ref);
    const settings = await loadSettings(tx);
    const status = p.status ?? cur.status;
    checkVocab(settings, { status });

    const compute = async (): Promise<number | null> => {
      if (p.ordinal !== undefined) return p.ordinal;
      if (p.beforeRef) {
        const b = await loadTask(tx, access, p.beforeRef);
        const prev = await neighbour(tx, cur.spaceId, status, b.ordinal, "prev", cur.id);
        if (prev === null) return b.ordinal - STEP;
        if (b.ordinal - prev < 1e-6) return null;
        return (prev + b.ordinal) / 2;
      }
      if (p.afterRef) {
        const a = await loadTask(tx, access, p.afterRef);
        const nxt = await neighbour(tx, cur.spaceId, status, a.ordinal, "next", cur.id);
        if (nxt === null) return a.ordinal + STEP;
        if (nxt - a.ordinal < 1e-6) return null;
        return (a.ordinal + nxt) / 2;
      }
      return status === cur.status ? cur.ordinal : endOfColumn(tx, cur.spaceId, status);
    };
    let ordinal = await compute();
    if (ordinal === null) {
      await renumberColumn(tx, cur.spaceId, status);
      ordinal = (await compute()) ?? (await endOfColumn(tx, cur.spaceId, status));
    }

    const st = await applyStatus(tx, access, settings, cur, cur, status, p.reason);
    if (status === cur.status && ordinal === cur.ordinal && !Object.keys(st).length) return cur.id;
    const changes: FieldChanges = {};
    if (status !== cur.status) changes.status = { from: cur.status, to: status };
    if (st.statusReason !== undefined && st.statusReason !== cur.statusReason)
      changes.statusReason = { from: cur.statusReason || null, to: st.statusReason || null };
    changes.ordinal = { from: cur.ordinal, to: ordinal };
    await tx
      .update(tasks)
      .set({ ...st, ordinal, ...(Object.keys(st).length ? { updatedAt: new Date() } : {}) })
      .where(eq(tasks.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: status !== cur.status ? "status" : "moved",
      summary:
        status !== cur.status
          ? `${cur.ref} "${cur.title}": ${cur.status} → ${status}${because(p.reason)}`
          : `Reordered ${cur.ref} in ${status}`,
      changes,
    });
    return cur.id;
  });
  const [s] = await summariesByIds(await getDb(), [id]);
  return s;
}

/** Put tasks in exactly this order (and optionally this status). */
export async function reorderTasks(
  access: Access,
  input: { status?: string; reason?: string; refs: string[] },
): Promise<TaskSummary[]> {
  const p = parse(reorderTasksInput, input);
  const ids = await withTx(async (tx) => {
    const rows = await loadTasks(tx, access, p.refs);
    const settings = await loadSettings(tx);
    if (p.status) checkVocab(settings, { status: p.status });
    const bySpace = new Map<string, string[]>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const status = p.status ?? r.status;
      const st = status !== r.status ? await applyStatus(tx, access, settings, r, r, status, p.reason) : {};
      await tx
        .update(tasks)
        .set({ ordinal: (i + 1) * STEP, ...st, ...(status !== r.status ? { updatedAt: new Date() } : {}) })
        .where(eq(tasks.id, r.id));
      if (!bySpace.has(r.spaceId)) bySpace.set(r.spaceId, []);
      bySpace.get(r.spaceId)!.push(r.ref);
    }
    for (const [spaceId, refs] of bySpace) {
      await logActivity(tx, access, {
        spaceId,
        entityType: "task",
        entityRef: refs[0],
        action: "moved",
        summary: `Reordered ${refs.length} task${refs.length === 1 ? "" : "s"}${p.status ? ` in ${p.status}` : ""}: ${refs.join(", ")}`,
        changes: { order: { from: null, to: refs }, ...(p.status ? { status: { from: null, to: p.status } } : {}) },
      });
    }
    return rows.map((r) => r.id);
  });
  return summariesByIds(await getDb(), ids);
}

// ── Archive / restore / delete ───────────────────────────────────────────────

async function archiveOne(q: DbOrTx, access: Access, cur: TaskRow, when: Date, why?: string) {
  const res = await q
    .update(tasks)
    .set({ archivedAt: when })
    .where(and(sql`(${tasks.id} = ${cur.id} or ${tasks.ref} like ${cur.ref + ".%"})`, isNull(tasks.archivedAt)))
    .returning({ ref: tasks.ref });
  const others = res.map((r) => r.ref).filter((r) => r !== cur.ref);
  await logActivity(q, access, {
    spaceId: cur.spaceId,
    entityType: "task",
    entityRef: cur.ref,
    action: "archived",
    summary: `Archived ${cur.ref} "${cur.title}"${others.length ? ` with ${others.join(", ")}` : ""}${why ? ` (${why})` : ""}`,
    changes: { archived: { from: false, to: true } },
  });
}

/** Archive a task and its non-archived descendants. */
export async function archiveTask(access: Access, ref: string): Promise<TaskFull> {
  const r = await withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    if (!cur.archivedAt) await archiveOne(tx, access, cur, new Date());
    return cur.ref;
  });
  return getTask(access, r);
}

/** Restore a task and the descendants archived together with it. The parent must not be archived. */
export async function restoreTask(access: Access, ref: string): Promise<TaskFull> {
  const r = await withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    if (!cur.archivedAt) return cur.ref;
    if (cur.parentId) {
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, cur.parentId));
      if (parent?.archivedAt) throw new Invalid(`Restore the parent ${parent.ref} first`);
    }
    const res = await tx
      .update(tasks)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(
        sql`${tasks.id} = ${cur.id} or (${tasks.ref} like ${cur.ref + ".%"} and ${tasks.archivedAt} = ${cur.archivedAt})`,
      )
      .returning({ ref: tasks.ref });
    const others = res.map((x) => x.ref).filter((x) => x !== cur.ref);
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "restored",
      summary: `Restored ${cur.ref} "${cur.title}"${others.length ? ` with ${others.join(", ")}` : ""}`,
      changes: { archived: { from: true, to: false } },
    });
    return cur.ref;
  });
  return getTask(access, r);
}

/** Permanently delete an archived task with no children. Its activity rows are kept. */
export async function deleteTask(access: Access, ref: string): Promise<{ ref: string; deleted: true }> {
  return withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    if (!cur.archivedAt) throw new Invalid(`Archive ${cur.ref} before deleting it`);
    const kids = await tx.select({ ref: tasks.ref }).from(tasks).where(eq(tasks.parentId, cur.id)).orderBy(refSortKey);
    if (kids.length)
      throw new Conflict(`Delete the sub-tasks of ${cur.ref} first: ${kids.map((k) => k.ref).join(", ")}`);
    await tx.delete(tasks).where(eq(tasks.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "deleted",
      summary: `Deleted ${cur.ref} "${cur.title}"`,
    });
    return { ref: cur.ref, deleted: true as const };
  });
}

async function setDraft(access: Access, ref: string, isDraft: boolean): Promise<TaskFull> {
  const r = await withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    if (cur.isDraft === isDraft) return cur.ref;
    await tx.update(tasks).set({ isDraft, updatedAt: new Date() }).where(eq(tasks.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: isDraft ? "demoted" : "promoted",
      summary: isDraft ? `Moved ${cur.ref} back to drafts` : `Promoted draft ${cur.ref} to a task`,
      changes: { isDraft: { from: cur.isDraft, to: isDraft } },
    });
    return cur.ref;
  });
  return getTask(access, r);
}

/** Draft → task (no-op if already a task). */
export const promoteDraft = (access: Access, ref: string) => setDraft(access, ref, false);
/** Task → draft (no-op if already a draft). */
export const demoteTask = (access: Access, ref: string) => setDraft(access, ref, true);

/** Archive finished tasks (done or cancelled) last updated more than `olderThanDays` days ago. */
export async function cleanupDone(
  access: Access,
  input: { olderThanDays: number; spaces?: string[] },
): Promise<{ archived: string[] }> {
  const p = parse(cleanupDoneInput, input);
  return withTx(async (tx) => {
    const settings = await loadSettings(tx);
    const cutoff = new Date(Date.now() - p.olderThanDays * 86_400_000);
    const rows = await tx
      .select()
      .from(tasks)
      .where(
        and(
          spaceScope(access, tasks.spaceId, p.spaces),
          inArray(tasks.status, settings.closedStatuses),
          isNull(tasks.archivedAt),
          eq(tasks.isDraft, false),
          lt(tasks.updatedAt, cutoff),
        ),
      )
      .orderBy(refSortKey);
    const when = new Date();
    const archived: string[] = [];
    for (const r of rows) {
      if (archived.some((a) => r.ref.startsWith(a + "."))) continue; // archived with its parent
      await archiveOne(tx, access, r, when, "clean up");
      archived.push(r.ref);
    }
    return { archived };
  });
}

export async function addComment(access: Access, ref: string, input: { body: string }): Promise<Comment> {
  const p = parse(commentInput, input);
  return withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    const [c] = await tx
      .insert(comments)
      .values({ taskId: cur.id, author: access.actor || "chat", body: p.body })
      .returning();
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "commented",
      summary: `Commented on ${cur.ref}: ${p.body.length > 80 ? p.body.slice(0, 77) + "…" : p.body}`,
    });
    return { id: c.id, author: c.author, body: c.body, createdAt: c.createdAt };
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

/** The board as markdown: one section per status, cards with children indented. */
export async function exportBoardMarkdown(access: Access, filters: ListTasksInput = {}): Promise<string> {
  const q = await getDb();
  const settings = await loadSettings(q);
  const { items } = await listTasks(access, { ...filters, limit: 1000 });
  const childrenOf = new Map<string, TaskSummary[]>();
  for (const t of items) {
    if (t.parentRef) {
      if (!childrenOf.has(t.parentRef)) childrenOf.set(t.parentRef, []);
      childrenOf.get(t.parentRef)!.push(t);
    }
  }
  const present = new Set(items.map((t) => t.ref));
  const line = (t: TaskSummary, indent: string) => {
    const bits = [t.type, t.priority, t.space.name, ...t.labels.map((l) => `#${l}`)].filter(Boolean);
    const progress = t.acTotal ? ` · AC ${t.acDone}/${t.acTotal}` : "";
    const kids = t.childTotal ? ` · ${t.childDone}/${t.childTotal} sub-tasks done` : "";
    const box = t.status === settings.doneStatus ? "x" : settings.closedStatuses.includes(t.status) ? "-" : " ";
    const why = settings.reasonStatuses.includes(t.status) && t.statusReason ? ` · ${t.status}: ${t.statusReason}` : "";
    return `${indent}- [${box}] **${t.ref}** ${t.title} (${bits.join(", ")})${progress}${kids}${why}`;
  };
  const out: string[] = [`# Board`, "", `_Exported ${new Date().toISOString().slice(0, 10)}_`, ""];
  for (const status of settings.statuses) {
    const col = items.filter((t) => t.status === status && !(t.parentRef && present.has(t.parentRef)));
    out.push(`## ${status} (${col.length})`, "");
    if (!col.length) out.push("_Empty_", "");
    for (const t of col) {
      out.push(line(t, ""));
      const walk = (ref: string, depth: number) => {
        for (const c of childrenOf.get(ref) ?? []) {
          out.push(`${"  ".repeat(depth)}${line(c, "").replace(/^- /, "- ")}${c.status !== status ? ` — ${c.status}` : ""}`);
          walk(c.ref, depth + 1);
        }
      };
      walk(t.ref, 1);
    }
    if (col.length) out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

