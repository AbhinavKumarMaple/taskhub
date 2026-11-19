import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { spaces, tasks } from "../db/schema";
import { Conflict } from "../errors";
import { createSpaceInput, listSpacesInput, parse, spaceId as spaceIdSchema, updateSpaceInput } from "../validation";
import type { Access, Space, SpaceColor, SpaceWithCounts } from "@/lib/types";
import { assertSpace, diff, loadSpace, logActivity, newSpaceId, newSpaceKey, withTx } from "./context";
import { loadSettings } from "./settings";

function shape(row: typeof spaces.$inferSelect): Space {
  return {
    id: row.id,
    name: row.name,
    color: row.color as SpaceColor,
    description: row.description,
    key: row.key,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function assertNameFree(name: string, exceptId?: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(sql`lower(${spaces.name}) = lower(${name})`);
  if (row && row.id !== exceptId) throw new Conflict(`A Space named "${name}" already exists`);
}

/**
 * Anyone with agent or owner access may create a Space. The result includes the key —
 * the credential a chat passes to work in it.
 */
export async function createSpace(
  access: Access,
  input: { name: string; description?: string; color?: SpaceColor },
): Promise<Space> {
  const p = parse(createSpaceInput, input);
  await assertNameFree(p.name);
  try {
    return await withTx(async (tx) => {
      const [row] = await tx
        .insert(spaces)
        .values({
          id: newSpaceId(),
          key: newSpaceKey(),
          name: p.name,
          description: p.description ?? "",
          color: p.color ?? "blue",
        })
        .returning();
      await logActivity(tx, access, {
        spaceId: row.id,
        entityType: "space",
        entityRef: row.id,
        action: "created",
        summary: `Created Space "${row.name}"`,
      });
      return shape(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Conflict(`A Space named "${p.name}" already exists`);
    throw err;
  }
}

/** The caller's Spaces with task counts, by name. */
export async function listSpaces(
  access: Access,
  input: { includeArchived?: boolean } = {},
): Promise<SpaceWithCounts[]> {
  const p = parse(listSpacesInput, input);
  const db = await getDb();
  if (access.spaces !== "all" && access.spaces.length === 0) return [];
  const where = and(
    access.spaces === "all" ? undefined : inArray(spaces.id, access.spaces),
    p.includeArchived ? undefined : isNull(spaces.archivedAt),
  );
  const rows = await db.select().from(spaces).where(where).orderBy(asc(sql`lower(${spaces.name})`));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const settings = await loadSettings(db);
  const counts = await db
    .select({
      spaceId: tasks.spaceId,
      status: tasks.status,
      isDraft: tasks.isDraft,
      archived: sql<boolean>`${tasks.archivedAt} is not null`,
      n: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(inArray(tasks.spaceId, ids))
    .groupBy(tasks.spaceId, tasks.status, tasks.isDraft, sql`${tasks.archivedAt} is not null`);
  return rows.map((r) => {
    const c: SpaceWithCounts["counts"] = { total: 0, open: 0, drafts: 0, archived: 0, byStatus: {} };
    for (const k of counts.filter((x) => x.spaceId === r.id)) {
      if (k.archived) c.archived += k.n;
      else if (k.isDraft) c.drafts += k.n;
      else {
        c.total += k.n;
        c.byStatus[k.status] = (c.byStatus[k.status] ?? 0) + k.n;
        if (k.status !== settings.doneStatus) c.open += k.n;
      }
    }
    return { ...shape(r), counts: c };
  });
}

export async function getSpace(access: Access, id: string): Promise<Space> {
  const sid = parse(spaceIdSchema, id);
  return shape(await loadSpace(await getDb(), access, sid));
}

export async function updateSpace(
  access: Access,
  id: string,
  input: { name?: string; description?: string; color?: SpaceColor },
): Promise<Space> {
  const sid = parse(spaceIdSchema, id);
  const p = parse(updateSpaceInput, input);
  if (p.name) {
    assertSpace(access, sid, "Space not found");
    await assertNameFree(p.name, sid);
  }
  try {
    return await withTx(async (tx) => {
      const cur = await loadSpace(tx, access, sid);
      const changes = diff(cur, p);
      if (!Object.keys(changes).length) return shape(cur);
      const [row] = await tx.update(spaces).set(p).where(eq(spaces.id, sid)).returning();
      await logActivity(tx, access, {
        spaceId: sid,
        entityType: "space",
        entityRef: sid,
        action: "updated",
        summary: changes.name ? `Renamed Space "${cur.name}" to "${row.name}"` : `Updated Space "${row.name}"`,
        changes,
      });
      return shape(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Conflict(`A Space named "${p.name}" already exists`);
    throw err;
  }
}

/** New key; the old one stops working at once. */
export async function regenerateKey(access: Access, id: string): Promise<Space> {
  const sid = parse(spaceIdSchema, id);
  return withTx(async (tx) => {
    const cur = await loadSpace(tx, access, sid);
    const [row] = await tx.update(spaces).set({ key: newSpaceKey() }).where(eq(spaces.id, sid)).returning();
    await logActivity(tx, access, {
      spaceId: sid,
      entityType: "space",
      entityRef: sid,
      action: "updated",
      summary: `Regenerated the key of Space "${cur.name}"`,
      changes: { key: { from: "(old key)", to: "(new key)" } },
    });
    return shape(row);
  });
}

export async function archiveSpace(access: Access, id: string): Promise<Space> {
  const sid = parse(spaceIdSchema, id);
  return withTx(async (tx) => {
    const cur = await loadSpace(tx, access, sid);
    if (cur.archivedAt) return shape(cur);
    const [row] = await tx.update(spaces).set({ archivedAt: new Date() }).where(eq(spaces.id, sid)).returning();
    await logActivity(tx, access, {
      spaceId: sid,
      entityType: "space",
      entityRef: sid,
      action: "archived",
      summary: `Archived Space "${cur.name}"`,
    });
    return shape(row);
  });
}

export async function restoreSpace(access: Access, id: string): Promise<Space> {
  const sid = parse(spaceIdSchema, id);
  return withTx(async (tx) => {
    const cur = await loadSpace(tx, access, sid);
    if (!cur.archivedAt) return shape(cur);
    const [row] = await tx.update(spaces).set({ archivedAt: null }).where(eq(spaces.id, sid)).returning();
    await logActivity(tx, access, {
      spaceId: sid,
      entityType: "space",
      entityRef: sid,
      action: "restored",
      summary: `Restored Space "${cur.name}"`,
    });
    return shape(row);
  });
}

/** Space keys → Space ids (unknown keys are dropped). Used by auth, not scoped by Access. */
export async function resolveKeys(keys: string[]): Promise<string[]> {
  const clean = [...new Set(keys.map((k) => k.trim()).filter((k) => /^sk_[a-z2-7]{32}$/.test(k)))];
  if (!clean.length) return [];
  const db = await getDb();
  const rows = await db.select({ id: spaces.id }).from(spaces).where(inArray(spaces.key, clean));
  return rows.map((r) => r.id);
}

/** Lightweight: id/name/color of the caller's Spaces (incl. archived), for labels and pickers. */
export async function listSpaceRefs(access: Access) {
  const db = await getDb();
  if (access.spaces !== "all" && access.spaces.length === 0) return [];
  const rows = await db
    .select({ id: spaces.id, name: spaces.name, color: spaces.color, archivedAt: spaces.archivedAt })
    .from(spaces)
    .where(access.spaces === "all" ? undefined : inArray(spaces.id, access.spaces))
    .orderBy(asc(sql`lower(${spaces.name})`));
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color as SpaceColor, archived: !!r.archivedAt }));
}

