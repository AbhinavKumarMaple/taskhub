import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { deploymentEvents, spaces, tasks, type DeploymentState, type TaskRow } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import {
  listDeploymentsInput,
  parse,
  recordDeploymentInput,
  rollbackDeploymentInput,
  taskRef as taskRefSchema,
  type RecordDeploymentInput,
} from "../validation";
import type { Access, DeploymentLogEntry, Settings, TaskFull, TaskSummary } from "@/lib/types";
import { assertSpace, logActivity, spaceRefCols, spaceScope, toSpaceRef, withTx } from "./context";
import { loadSettings } from "./settings";
import { getTask, loadTask, summariesByIds, toDeploymentEvent } from "./tasks";

function checkEnvironment(settings: Settings, env: string): string {
  // Case-insensitive match, stored with the configured spelling.
  const hit = settings.environments.find((e) => e.toLowerCase() === env.trim().toLowerCase());
  if (!hit)
    throw new Invalid(
      settings.environments.length
        ? `Unknown environment "${env}". Use one of: ${settings.environments.join(", ")}`
        : "No environments are set up (Settings → Environments)",
    );
  return hit;
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Record that a deploy shipped these tasks to an environment. Marks each one deployable, sets its current
 * deploy for that environment (version, link, who, when) and adds a step to its deploy history.
 * With `includeChildren`, every non-archived descendant is marked too (deploying a whole feature).
 */
export async function recordDeployment(access: Access, input: RecordDeploymentInput): Promise<TaskSummary[]> {
  const p = parse(recordDeploymentInput, input);
  const ids = await withTx(async (tx) => {
    const settings = await loadSettings(tx);
    const env = checkEnvironment(settings, p.environment);
    const refs = [...new Set(p.refs.map((r) => parse(taskRefSchema, r)))];
    const roots = await tx.select().from(tasks).where(inArray(tasks.ref, refs));
    for (const r of refs) {
      const row = roots.find((x) => x.ref === r);
      if (!row) throw new NotFound(`Task ${r} not found`);
      assertSpace(access, row.spaceId, `Task ${r} not found`);
    }
    let targets: TaskRow[] = roots;
    if (p.includeChildren) {
      const kids = await tx
        .select()
        .from(tasks)
        .where(and(or(...roots.map((r) => sql`${tasks.ref} like ${r.ref + ".%"}`)), isNull(tasks.archivedAt)));
      const seen = new Set(roots.map((r) => r.id));
      targets = [...roots, ...kids.filter((k) => !seen.has(k.id) && (seen.add(k.id), true))];
    }
    const now = new Date();
    const state: DeploymentState = {
      version: p.version ?? "",
      url: p.url ?? "",
      note: p.note ?? "",
      actor: access.actor || "chat",
      at: now.toISOString(),
    };
    for (const t of targets) {
      await tx
        .update(tasks)
        .set({
          deployable: true,
          deployments: sql`${tasks.deployments} || jsonb_build_object(${env}::text, ${JSON.stringify(state)}::jsonb)`,
          updatedAt: now,
        })
        .where(eq(tasks.id, t.id));
      await tx.insert(deploymentEvents).values({
        taskId: t.id,
        spaceId: t.spaceId,
        environment: env,
        action: "deployed",
        version: state.version,
        url: state.url,
        note: state.note,
        actor: state.actor,
        createdAt: now,
      });
      const prev = (t.deployments ?? {})[env];
      await logActivity(tx, access, {
        spaceId: t.spaceId,
        entityType: "task",
        entityRef: t.ref,
        action: "deployed",
        summary: `${t.ref} "${short(t.title, 60)}" deployed to ${env}${state.version ? ` (${short(state.version, 40)})` : ""}${state.note ? `: ${short(state.note)}` : ""}`,
        changes: {
          [`deployments.${env}`]: { from: prev ? prev.version || prev.at : null, to: state.version || state.at },
          ...(t.deployable ? {} : { deployable: { from: false, to: true } }),
        },
      });
    }
    return targets.map((t) => t.id);
  });
  return summariesByIds(await getDb(), ids);
}

/** Take a task's deploy off an environment (rolled back or never really shipped). Kept in the history. */
export async function rollbackDeployment(
  access: Access,
  ref: string,
  input: { environment: string; note?: string },
): Promise<TaskFull> {
  const p = parse(rollbackDeploymentInput, input);
  const finalRef = await withTx(async (tx) => {
    const settings = await loadSettings(tx);
    const cur = await loadTask(tx, access, ref);
    // A removed environment can still be rolled back if a task somehow holds it.
    const env =
      Object.keys(cur.deployments ?? {}).find((e) => e.toLowerCase() === p.environment.toLowerCase()) ??
      checkEnvironment(settings, p.environment);
    const prev = (cur.deployments ?? {})[env];
    if (!prev) throw new Invalid(`${cur.ref} is not deployed to ${env}`);
    const now = new Date();
    await tx
      .update(tasks)
      .set({ deployments: sql`${tasks.deployments} - ${env}::text`, updatedAt: now })
      .where(eq(tasks.id, cur.id));
    await tx.insert(deploymentEvents).values({
      taskId: cur.id,
      spaceId: cur.spaceId,
      environment: env,
      action: "rolled_back",
      version: prev.version,
      url: "",
      note: p.note ?? "",
      actor: access.actor || "chat",
      createdAt: now,
    });
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "deployed",
      summary: `${cur.ref} rolled back from ${env}${prev.version ? ` (${short(prev.version, 40)})` : ""}${p.note ? `: ${short(p.note)}` : ""}`,
      changes: { [`deployments.${env}`]: { from: prev.version || prev.at, to: null } },
    });
    return cur.ref;
  });
  return getTask(access, finalRef);
}

/** Recent deploys and roll-backs across the caller's Spaces, newest first. */
export async function listDeployments(
  access: Access,
  filters: { spaces?: string | string[]; environment?: string; limit?: number } = {},
): Promise<DeploymentLogEntry[]> {
  const p = parse(listDeploymentsInput, filters);
  const q = await getDb();
  const rows = await q
    .select({ e: deploymentEvents, ref: tasks.ref, title: tasks.title, status: tasks.status, sp: spaceRefCols })
    .from(deploymentEvents)
    .innerJoin(tasks, eq(tasks.id, deploymentEvents.taskId))
    .innerJoin(spaces, eq(spaces.id, tasks.spaceId))
    .where(
      and(
        spaceScope(access, deploymentEvents.spaceId, p.spaces),
        spaceScope(access, tasks.spaceId, p.spaces),
        p.environment ? sql`lower(${deploymentEvents.environment}) = lower(${p.environment})` : undefined,
      ),
    )
    .orderBy(desc(deploymentEvents.id))
    .limit(p.limit ?? 100);
  return rows.map((r) => ({
    ...toDeploymentEvent(r.e),
    task: { ref: r.ref, title: r.title, status: r.status },
    space: toSpaceRef(r.sp),
  }));
}
