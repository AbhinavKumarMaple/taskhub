import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { milestones, spaces, tasks, type MilestoneRow } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import {
  createMilestoneInput,
  listEntitiesInput,
  milestoneRef,
  parse,
  updateMilestoneInput,
  type ListEntitiesInput,
} from "../validation";
import { fieldList } from "@/lib/field-labels";
import type { Access, Milestone, MilestoneFull } from "@/lib/types";
import {
  allWordsMatch,
  archivedFilter,
  assertSpace,
  diff,
  logActivity,
  nextCounter,
  resolveCreateSpace,
  spaceRefCols,
  spaceScope,
  toSpaceRef,
  withTx,
} from "./context";
import { loadSettings } from "./settings";
import { listTasks } from "./tasks";

async function load(q: DbOrTx, access: Access, ref: string): Promise<MilestoneRow> {
  const r = parse(milestoneRef, ref);
  const [row] = await q.select().from(milestones).where(eq(milestones.ref, r));
  if (!row) throw new NotFound(`Milestone ${r} not found`);
  assertSpace(access, row.spaceId, `Milestone ${r} not found`);
  return row;
}

async function withProgress(
  q: DbOrTx,
  rows: { m: MilestoneRow; sp: { id: string; name: string; color: string } }[],
): Promise<Milestone[]> {
  if (!rows.length) return [];
  const settings = await loadSettings(q);
  const counts = await q
    .select({
      id: tasks.milestoneId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`(count(*) filter (where ${inArray(tasks.status, settings.closedStatuses)}))::int`,
    })
    .from(tasks)
    .where(
      and(
        inArray(
          tasks.milestoneId,
          rows.map((r) => r.m.id),
        ),
        isNull(tasks.archivedAt),
        eq(tasks.isDraft, false),
      ),
    )
    .groupBy(tasks.milestoneId);
  return rows.map(({ m, sp }) => {
    const c = counts.find((x) => x.id === m.id);
    return {
      id: m.id,
      ref: m.ref,
      space: toSpaceRef(sp),
      title: m.title,
      description: m.description,
      dueDate: m.dueDate,
      createdAt: m.createdAt,
      archivedAt: m.archivedAt,
      taskTotal: c?.total ?? 0,
      taskDone: c?.done ?? 0,
    };
  });
}

async function one(q: DbOrTx, id: number): Promise<Milestone> {
  const rows = await q
    .select({ m: milestones, sp: spaceRefCols })
    .from(milestones)
    .innerJoin(spaces, eq(spaces.id, milestones.spaceId))
    .where(eq(milestones.id, id));
  return (await withProgress(q, rows))[0];
}

export async function createMilestone(
  access: Access,
  input: { spaceId?: string; title: string; description?: string; dueDate?: string | null },
): Promise<Milestone> {
  const p = parse(createMilestoneInput, input);
  const spaceId = resolveCreateSpace(access, p.spaceId);
  const id = await withTx(async (tx) => {
    const [sp] = await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId));
    if (!sp) throw new NotFound("Space not found");
    const ref = `M-${await nextCounter(tx, "milestone")}`;
    const [row] = await tx
      .insert(milestones)
      .values({ ref, spaceId, title: p.title, description: p.description ?? "", dueDate: p.dueDate ?? null })
      .returning();
    await logActivity(tx, access, {
      spaceId,
      entityType: "milestone",
      entityRef: ref,
      action: "created",
      summary: `Created milestone ${ref} "${row.title}"`,
      changes: { title: { from: null, to: row.title } },
    });
    return row.id;
  });
  return one(await getDb(), id);
}

/** Milestones in the caller's Spaces with progress (non-archived, non-draft tasks). */
export async function listMilestones(access: Access, input: ListEntitiesInput = {}): Promise<Milestone[]> {
  const p = parse(listEntitiesInput, input);
  const q = await getDb();
  const rows = await q
    .select({ m: milestones, sp: spaceRefCols })
    .from(milestones)
    .innerJoin(spaces, eq(spaces.id, milestones.spaceId))
    .where(
      and(
        spaceScope(access, milestones.spaceId, p.spaces),
        archivedFilter(milestones.archivedAt, p),
        allWordsMatch(p.q, [milestones.ref, milestones.title, milestones.description]),
      ),
    )
    .orderBy(sql`${milestones.dueDate} asc nulls last`, asc(milestones.id));
  return withProgress(q, rows);
}

/** Milestone with its tasks (all non-draft tasks, archived excluded). */
export async function getMilestone(access: Access, ref: string): Promise<MilestoneFull> {
  const q = await getDb();
  const m = await load(q, access, ref);
  const base = await one(q, m.id);
  const { items } = await listTasks(access, { spaces: [m.spaceId], milestone: m.ref, limit: 1000, sort: "status" });
  return { ...base, tasks: items };
}

export async function updateMilestone(
  access: Access,
  ref: string,
  input: { title?: string; description?: string; dueDate?: string | null },
): Promise<Milestone> {
  const p = parse(updateMilestoneInput, input);
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    const changes = diff(cur, p);
    if (!Object.keys(changes).length) return cur.id;
    await tx.update(milestones).set(p).where(eq(milestones.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "milestone",
      entityRef: cur.ref,
      action: "updated",
      summary: `Updated milestone ${cur.ref} (${fieldList(Object.keys(changes))})`,
      changes,
    });
    return cur.id;
  });
  return one(await getDb(), id);
}

async function setArchived(access: Access, ref: string, archived: boolean): Promise<Milestone> {
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!!cur.archivedAt === archived) return cur.id;
    await tx
      .update(milestones)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(milestones.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "milestone",
      entityRef: cur.ref,
      action: archived ? "archived" : "restored",
      summary: `${archived ? "Archived" : "Restored"} milestone ${cur.ref} "${cur.title}"`,
      changes: { archived: { from: !archived, to: archived } },
    });
    return cur.id;
  });
  return one(await getDb(), id);
}

export const archiveMilestone = (access: Access, ref: string) => setArchived(access, ref, true);
export const restoreMilestone = (access: Access, ref: string) => setArchived(access, ref, false);

/** Permanently delete an archived milestone (its tasks keep existing, unassigned). */
export async function deleteMilestone(access: Access, ref: string): Promise<{ ref: string; deleted: true }> {
  return withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!cur.archivedAt) throw new Invalid(`Archive ${cur.ref} before deleting it`);
    await tx.delete(milestones).where(eq(milestones.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "milestone",
      entityRef: cur.ref,
      action: "deleted",
      summary: `Deleted milestone ${cur.ref} "${cur.title}"`,
    });
    return { ref: cur.ref, deleted: true as const };
  });
}
