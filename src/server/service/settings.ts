import { eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { settings, tasks } from "../db/schema";
import { Conflict, Invalid } from "../errors";
import { parse, updateSettingsInput, type UpdateSettingsInput } from "../validation";
import { fieldList } from "@/lib/field-labels";
import type { Access, Settings } from "@/lib/types";
import { diff, logActivity, requireOwnerAccess, withTx } from "./context";

export const DEFAULT_SETTINGS = {
  statuses: ["To Do", "In Progress", "Done"],
  defaultStatus: "To Do",
  types: ["feature", "sub-feature", "fix", "minor"],
  priorities: ["High", "Medium", "Low"],
  labels: ["waiting"],
  dodDefaults: [] as string[],
};

function shape(row: typeof settings.$inferSelect): Settings {
  return {
    statuses: row.statuses,
    defaultStatus: row.defaultStatus,
    doneStatus: row.statuses[row.statuses.length - 1],
    types: row.types,
    priorities: row.priorities,
    labels: row.labels,
    dodDefaults: row.dodDefaults,
    updatedAt: row.updatedAt,
  };
}

/** Settings via a given connection/transaction; creates the default row on first use. */
export async function loadSettings(tx: DbOrTx): Promise<Settings> {
  const [row] = await tx.select().from(settings).where(eq(settings.id, 1));
  if (row) return shape(row);
  await tx
    .insert(settings)
    .values({ id: 1, ...DEFAULT_SETTINGS })
    .onConflictDoNothing();
  const [created] = await tx.select().from(settings).where(eq(settings.id, 1));
  return shape(created);
}

/** Readable by everyone (chats need the vocabulary). */
export async function getSettings(_access: Access): Promise<Settings> {
  void _access;
  return loadSettings(await getDb());
}

type ListKey = "statuses" | "types" | "priorities" | "labels";
const COLUMN: Record<ListKey, "status" | "type" | "priority" | "labels"> = {
  statuses: "status",
  types: "type",
  priorities: "priority",
  labels: "labels",
};

/**
 * Owner only. Renames (in `renames`) migrate existing tasks; removing a value still used by any task
 * (archived included) throws Conflict.
 */
export async function updateSettings(access: Access, input: UpdateSettingsInput): Promise<Settings> {
  requireOwnerAccess(access);
  const p = parse(updateSettingsInput, input);
  return withTx(async (tx) => {
    const cur = await loadSettings(tx);
    const next = {
      statuses: p.statuses ?? cur.statuses,
      types: p.types ?? cur.types,
      priorities: p.priorities ?? cur.priorities,
      labels: p.labels ?? cur.labels,
      dodDefaults: p.dodDefaults ?? cur.dodDefaults,
      defaultStatus: p.defaultStatus ?? cur.defaultStatus,
    };

    for (const key of ["statuses", "types", "priorities", "labels"] as ListKey[]) {
      const renames = p.renames?.[key] ?? [];
      const col = COLUMN[key];
      const oldList = [...cur[key]];
      for (const r of renames) {
        if (r.from === r.to) continue;
        if (!oldList.includes(r.from)) throw new Invalid(`${key}: "${r.from}" does not exist`);
        if (!next[key].includes(r.to)) throw new Invalid(`${key}: rename target "${r.to}" must be in the new list`);
        if (col === "labels") {
          // replace, then de-duplicate keeping first-seen order
          await tx
            .update(tasks)
            .set({
              labels: sql`array(select x from unnest(array_replace(${tasks.labels}, ${r.from}::text, ${r.to}::text)) with ordinality as t(x, i) group by x order by min(i))`,
            })
            .where(sql`${r.from}::text = any(${tasks.labels})`);
        } else {
          await tx
            .update(tasks)
            .set(col === "status" ? { status: r.to } : col === "type" ? { type: r.to } : { priority: r.to })
            .where(eq(tasks[col], r.from));
        }
        oldList[oldList.indexOf(r.from)] = r.to;
        if (key === "statuses" && next.defaultStatus === r.from) next.defaultStatus = r.to;
      }
      const removed = oldList.filter((v) => !next[key].includes(v));
      for (const v of removed) {
        const cond = col === "labels" ? sql`${v}::text = any(${tasks.labels})` : eq(tasks[col], v);
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(tasks)
          .where(cond);
        if (n > 0) throw new Conflict(`Cannot remove ${col} "${v}": ${n} task${n === 1 ? "" : "s"} still use it`);
      }
    }
    if (!next.statuses.includes(next.defaultStatus)) {
      if (p.defaultStatus) throw new Invalid(`defaultStatus "${p.defaultStatus}" is not a status`);
      next.defaultStatus = next.statuses[0];
    }

    const changes = diff(
      { ...cur } as Record<string, unknown>,
      next as unknown as Record<string, unknown>,
    );
    await tx
      .update(settings)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(settings.id, 1));
    if (Object.keys(changes).length) {
      await logActivity(tx, access, {
        spaceId: null,
        entityType: "settings",
        entityRef: "settings",
        action: "updated",
        summary: `Updated settings (${fieldList(Object.keys(changes))})`,
        changes,
      });
    }
    return loadSettings(tx);
  });
}
