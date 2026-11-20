import { eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { deploymentEvents, settings, statusEvents, tasks } from "../db/schema";
import { Conflict, Invalid } from "../errors";
import { parse, updateSettingsInput, type UpdateSettingsInput } from "../validation";
import { fieldList } from "@/lib/field-labels";
import type { Access, Settings } from "@/lib/types";
import { diff, logActivity, requireOwnerAccess, withTx } from "./context";

export const DEFAULT_SETTINGS = {
  statuses: ["To Do", "In Progress", "Blocked", "Done", "Cancelled"],
  defaultStatus: "To Do",
  doneStatus: "Done",
  closedStatuses: ["Done", "Cancelled"],
  reasonStatuses: ["Blocked", "Cancelled"],
  types: ["feature", "sub-feature", "fix", "minor"],
  priorities: ["High", "Medium", "Low"],
  labels: ["waiting"],
  dodDefaults: [] as string[],
  environments: ["Development", "Production"],
};

function shape(row: typeof settings.$inferSelect): Settings {
  const doneStatus = row.statuses.includes(row.doneStatus) ? row.doneStatus : row.statuses[row.statuses.length - 1];
  const closedStatuses = [doneStatus, ...row.closedStatuses.filter((s) => s !== doneStatus && row.statuses.includes(s))];
  const reasonStatuses = row.reasonStatuses.filter((s) => row.statuses.includes(s) && s !== doneStatus);
  return {
    statuses: row.statuses,
    defaultStatus: row.defaultStatus,
    doneStatus,
    closedStatuses,
    reasonStatuses,
    stoppedStatuses: reasonStatuses.filter((s) => !closedStatuses.includes(s)),
    types: row.types,
    priorities: row.priorities,
    labels: row.labels,
    dodDefaults: row.dodDefaults,
    environments: row.environments,
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
      doneStatus: p.doneStatus ?? cur.doneStatus,
      closedStatuses: p.closedStatuses ?? cur.closedStatuses,
      reasonStatuses: p.reasonStatuses ?? cur.reasonStatuses,
      environments: p.environments ?? cur.environments,
    };

    // Environments: renames move the current deploys and the history; removing one still deployed is refused.
    {
      const lower = next.environments.map((e) => e.toLowerCase());
      const dup = next.environments.find((_, i) => lower.indexOf(lower[i]) !== i);
      if (dup) throw new Invalid(`environments: "${dup}" is listed twice (names are matched without case)`);
      const oldEnvs = [...cur.environments];
      for (const r of p.renames?.environments ?? []) {
        if (r.from === r.to) continue;
        if (!oldEnvs.includes(r.from)) throw new Invalid(`environments: "${r.from}" does not exist`);
        if (oldEnvs.includes(r.to))
          throw new Conflict(`environments: cannot rename "${r.from}" to "${r.to}": "${r.to}" already exists (its deploys would be overwritten)`);
        if (!next.environments.includes(r.to)) throw new Invalid(`environments: rename target "${r.to}" must be in the new list`);
        await tx
          .update(tasks)
          .set({
            deployments: sql`(${tasks.deployments} - ${r.from}::text) || jsonb_build_object(${r.to}::text, ${tasks.deployments} -> ${r.from}::text)`,
          })
          .where(sql`(${tasks.deployments} -> ${r.from}::text) is not null`);
        await tx.update(deploymentEvents).set({ environment: r.to }).where(eq(deploymentEvents.environment, r.from));
        oldEnvs[oldEnvs.indexOf(r.from)] = r.to;
      }
      for (const v of oldEnvs.filter((e) => !next.environments.includes(e))) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(tasks)
          .where(sql`(${tasks.deployments} -> ${v}::text) is not null`);
        if (n > 0)
          throw new Conflict(`Cannot remove environment "${v}": ${n} task${n === 1 ? " is" : "s are"} deployed there`);
      }
    }

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
        if (key === "statuses") {
          if (next.defaultStatus === r.from) next.defaultStatus = r.to;
          if (next.doneStatus === r.from) next.doneStatus = r.to;
          next.closedStatuses = next.closedStatuses.map((s) => (s === r.from ? r.to : s));
          next.reasonStatuses = next.reasonStatuses.map((s) => (s === r.from ? r.to : s));
          await tx.update(statusEvents).set({ toStatus: r.to }).where(eq(statusEvents.toStatus, r.from));
          await tx.update(statusEvents).set({ fromStatus: r.to }).where(eq(statusEvents.fromStatus, r.from));
        }
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
    if (!next.statuses.includes(next.doneStatus)) {
      if (p.doneStatus) throw new Invalid(`doneStatus "${p.doneStatus}" is not a status`);
      next.doneStatus = next.statuses[next.statuses.length - 1];
    }
    for (const [k, list] of [["closedStatuses", next.closedStatuses], ["reasonStatuses", next.reasonStatuses]] as const) {
      const bad = list.filter((s) => !next.statuses.includes(s));
      if (bad.length && p[k]) throw new Invalid(`${k}: "${bad[0]}" is not a status`);
    }
    next.closedStatuses = [...new Set([next.doneStatus, ...next.closedStatuses.filter((s) => next.statuses.includes(s))])];
    next.reasonStatuses = next.reasonStatuses.filter((s) => next.statuses.includes(s) && s !== next.doneStatus);
    if (next.reasonStatuses.includes(next.defaultStatus))
      throw new Invalid(`The default status "${next.defaultStatus}" cannot be one that needs a reason`);

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
