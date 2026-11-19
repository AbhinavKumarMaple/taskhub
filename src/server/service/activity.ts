import { and, desc, eq, inArray, isNull, lt, max, sql } from "drizzle-orm";
import { getDb } from "../db";
import { activity, decisions, documents, milestones, tasks } from "../db/schema";
import { listActivityInput, parse } from "../validation";
import type { Access, Activity, ActivityPage, NavCounts } from "@/lib/types";
import { assertSpace, effectiveSpaces, spaceScope } from "./context";
import { loadSettings } from "./settings";

/** Activity timeline, newest first. Owner also sees settings rows (no Space). */
export async function listActivity(
  access: Access,
  input: { spaceId?: string; entityRef?: string; actor?: string; limit?: number; before?: number } = {},
): Promise<ActivityPage> {
  const p = parse(listActivityInput, input);
  const db = await getDb();
  if (p.spaceId) assertSpace(access, p.spaceId, "Space not found");
  const scope = p.spaceId
    ? eq(activity.spaceId, p.spaceId)
    : access.spaces === "all"
      ? undefined
      : access.spaces.length
        ? inArray(activity.spaceId, access.spaces)
        : sql`false`;
  const limit = p.limit ?? 50;
  const rows = await db
    .select()
    .from(activity)
    .where(
      and(
        scope,
        p.entityRef ? eq(activity.entityRef, p.entityRef) : undefined,
        p.actor ? eq(activity.actor, p.actor) : undefined,
        p.before ? lt(activity.id, p.before) : undefined,
      ),
    )
    .orderBy(desc(activity.id))
    .limit(limit);
  return {
    items: rows as Activity[],
    nextBefore: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}

/** Distinct actor names seen in the caller's activity (for filters). */
export async function listActors(access: Access): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ actor: activity.actor })
    .from(activity)
    .where(
      access.spaces === "all"
        ? undefined
        : access.spaces.length
          ? inArray(activity.spaceId, access.spaces)
          : sql`false`,
    )
    .orderBy(activity.actor);
  return rows.map((r) => r.actor);
}

/**
 * A cheap change marker for polling: changes whenever anything visible to the caller is written
 * (every write appends an activity row).
 */
export async function getVersion(access: Access, input: { spaces?: string[] } = {}): Promise<string> {
  const db = await getDb();
  const eff = effectiveSpaces(access, input.spaces);
  const where =
    eff === "all" ? undefined : eff.length ? inArray(activity.spaceId, eff) : sql`false`;
  const [r] = await db.select({ v: max(activity.id) }).from(activity).where(where);
  // settings changes affect every board (column names)
  const [s] = await db.select({ v: max(activity.id) }).from(activity).where(isNull(activity.spaceId));
  return `${r?.v ?? 0}.${s?.v ?? 0}`;
}

/** Sidebar counts for the selected Space(s). */
export async function getNavCounts(access: Access, input: { spaces?: string[] } = {}): Promise<NavCounts> {
  const db = await getDb();
  const settings = await loadSettings(db);
  const scopeT = spaceScope(access, tasks.spaceId, input.spaces);
  const [t] = await db
    .select({
      // Same cards as the main view (/board?type=feature), so the sidebar matches the board header.
      board: settings.types.includes("feature")
        ? sql<number>`(count(*) filter (where ${tasks.archivedAt} is null and not ${tasks.isDraft} and ${tasks.type} = 'feature'))::int`
        : sql<number>`(count(*) filter (where ${tasks.archivedAt} is null and not ${tasks.isDraft}))::int`,
      tasks: sql<number>`(count(*) filter (where ${tasks.archivedAt} is null and not ${tasks.isDraft}))::int`,
      drafts: sql<number>`(count(*) filter (where ${tasks.archivedAt} is null and ${tasks.isDraft}))::int`,
      archive: sql<number>`(count(*) filter (where ${tasks.archivedAt} is not null))::int`,
    })
    .from(tasks)
    .where(scopeT);
  const count = async (table: typeof milestones | typeof documents | typeof decisions) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(and(spaceScope(access, table.spaceId, input.spaces), isNull(table.archivedAt)));
    return r.n;
  };
  const [m, d, dec] = await Promise.all([count(milestones), count(documents), count(decisions)]);
  return { ...t, milestones: m, documents: d, decisions: dec };
}
