import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { activity, tasks } from "../db/schema";
import { parse, statisticsInput } from "../validation";
import type { Access, CountRow, Statistics } from "@/lib/types";
import { effectiveSpaces, spaceScope } from "./context";
import { loadSettings } from "./settings";
import { listTasks } from "./tasks";

const DAY = 86_400_000;
export const WAITING_LABEL = "waiting";

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(x.getTime() - dow * DAY);
}

/** Counts by status/type/priority, completion, weekly created vs completed, oldest open, waiting. */
export async function statistics(access: Access, input: { spaces?: string[] } = {}): Promise<Statistics> {
  const p = parse(statisticsInput, input);
  const db = await getDb();
  const settings = await loadSettings(db);
  const done = settings.doneStatus;
  const active = and(spaceScope(access, tasks.spaceId, p.spaces), isNull(tasks.archivedAt), eq(tasks.isDraft, false));

  const group = async (col: typeof tasks.status | typeof tasks.type | typeof tasks.priority, order: string[]) => {
    const rows = await db
      .select({ name: col, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(active)
      .groupBy(col);
    const out: CountRow[] = order.map((name) => ({ name, count: rows.find((r) => r.name === name)?.count ?? 0 }));
    for (const r of rows) {
      const name = r.name ?? "None";
      if (!order.includes(name)) out.push({ name, count: r.count });
    }
    return out;
  };
  const [byStatus, byType, byPriority] = await Promise.all([
    group(tasks.status, settings.statuses),
    group(tasks.type, settings.types),
    group(tasks.priority, settings.priorities),
  ]);
  const total = byStatus.reduce((a, r) => a + r.count, 0);
  const doneCount = byStatus.find((r) => r.name === done)?.count ?? 0;

  // weekly: last 8 weeks including this one
  const thisWeek = weekStart(new Date());
  const from = new Date(thisWeek.getTime() - 7 * 7 * DAY);
  const created = await db
    .select({ at: tasks.createdAt })
    .from(tasks)
    .where(and(spaceScope(access, tasks.spaceId, p.spaces), eq(tasks.isDraft, false), gte(tasks.createdAt, from)));
  const eff = effectiveSpaces(access, p.spaces);
  const completed = await db
    .select({ at: activity.createdAt })
    .from(activity)
    .where(
      and(
        eff === "all" ? undefined : eff.length ? inArray(activity.spaceId, eff) : sql`false`,
        eq(activity.entityType, "task"),
        inArray(activity.action, ["status", "created"]),
        sql`${activity.changes} -> 'status' ->> 'to' = ${done}`,
        gte(activity.createdAt, from),
      ),
    );
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(from.getTime() + i * 7 * DAY);
    const end = start.getTime() + 7 * DAY;
    const inWeek = (d: Date) => d.getTime() >= start.getTime() && d.getTime() < end;
    return {
      weekStart: start.toISOString().slice(0, 10),
      created: created.filter((r) => inWeek(r.at)).length,
      completed: completed.filter((r) => inWeek(r.at)).length,
    };
  });

  const [oldest, waiting] = await Promise.all([
    listTasks(access, { spaces: p.spaces, excludeStatus: [done], sort: "created", order: "asc", limit: 10 }),
    listTasks(access, {
      spaces: p.spaces,
      excludeStatus: [done],
      labels: [WAITING_LABEL],
      sort: "updated",
      order: "desc",
      limit: 50,
    }),
  ]);

  return {
    total,
    byStatus,
    byType,
    byPriority,
    completion: { done: doneCount, total, percent: total ? Math.round((doneCount / total) * 100) : 0 },
    weekly,
    oldestOpen: oldest.items,
    waiting: waiting.items,
  };
}
