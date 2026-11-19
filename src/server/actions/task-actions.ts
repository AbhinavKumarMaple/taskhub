"use server";

/**
 * Task Server Actions shared by every UI area (board, lists, drafts, archive, task detail).
 * Each one re-checks the owner session and returns `ActionResult<T>`:
 * `{ ok: true, data }` or `{ ok: false, error, code }`. Writes call `refresh()` so server-rendered
 * pages (and sidebar counts) update in the same round trip.
 */

import { runAction, runQuery } from "@/server/actions";
import * as svc from "@/server/service";
import type { CreateTaskInput, MoveTaskInput, UpdateTaskInput } from "@/server/validation";
import type { TaskLite } from "@/lib/types";
import { loadTaskDetail } from "./task-detail-data";

/** Loads everything the task detail needs (task, settings, Spaces, milestones). Read-only. */
export async function getTaskDetailAction(ref: string) {
  return runQuery((a) => loadTaskDetail(a, ref));
}

/** Just the task (read-only). */
export async function getTaskAction(ref: string) {
  return runQuery((a) => svc.getTask(a, ref));
}

/** Settings for pickers (statuses, types, priorities, labels). Read-only. */
export async function getSettingsAction() {
  return runQuery((a) => svc.getSettings(a));
}

/** Everything the New task form needs: settings, non-archived Spaces, non-archived milestones (all Spaces). */
export async function getTaskFormOptionsAction() {
  return runQuery(async (a) => {
    const [settings, spaceRefs, milestones] = await Promise.all([
      svc.getSettings(a),
      svc.listSpaceRefs(a),
      svc.listMilestones(a, {}),
    ]);
    return {
      settings,
      spaces: spaceRefs.filter((s) => !s.archived).map(({ id, name, color }) => ({ id, name, color })),
      milestones: milestones.map((m) => ({ ref: m.ref, title: m.title, spaceId: m.space.id })),
    };
  });
}

export async function createTaskAction(input: CreateTaskInput) {
  return runAction((a) => svc.createTask(a, input));
}

/** `{ ref, ...fields/ops }` — any UpdateTaskInput field plus the ref. Returns the full task. */
export async function updateTaskAction(input: UpdateTaskInput & { ref: string }) {
  const { ref, ...patch } = input;
  return runAction((a) => svc.updateTask(a, ref, patch));
}

/** Drag and drop: `{ ref, status?, ordinal?, beforeRef?, afterRef? }`. */
export async function moveTaskAction(input: MoveTaskInput) {
  return runAction((a) => svc.moveTask(a, input));
}

export async function reorderTasksAction(input: { status?: string; refs: string[] }) {
  return runAction((a) => svc.reorderTasks(a, input));
}

export async function archiveTaskAction(ref: string) {
  return runAction((a) => svc.archiveTask(a, ref));
}

export async function restoreTaskAction(ref: string) {
  return runAction((a) => svc.restoreTask(a, ref));
}

/** Archived tasks only; fails with Conflict while children exist. */
export async function deleteTaskAction(ref: string) {
  return runAction((a) => svc.deleteTask(a, ref));
}

export async function promoteDraftAction(ref: string) {
  return runAction((a) => svc.promoteDraft(a, ref));
}

export async function demoteTaskAction(ref: string) {
  return runAction((a) => svc.demoteTask(a, ref));
}

export async function addCommentAction(input: { ref: string; body: string }) {
  return runAction((a) => svc.addComment(a, input.ref, { body: input.body }));
}

export async function cleanupDoneAction(input: { olderThanDays: number; spaces?: string[] }) {
  return runAction((a) => svc.cleanupDone(a, input));
}

/**
 * Candidate tasks for the dependency picker: tasks in `spaceId` whose ref or title matches `q`
 * (a ref like "T-12" matches exactly first). Excludes `exceptRef`.
 */
export async function findTasksAction(input: { q: string; spaceId: string; exceptRef?: string; limit?: number }) {
  return runQuery(async (a): Promise<TaskLite[]> => {
    const q = input.q.trim();
    if (!q) return [];
    const limit = input.limit ?? 8;
    const out: TaskLite[] = [];
    const seen = new Set<string>();
    const except = input.exceptRef?.toUpperCase();
    const push = (t: TaskLite) => {
      if (seen.has(t.ref) || t.ref === except) return;
      seen.add(t.ref);
      out.push(t);
    };
    if (/^t-\d+(\.\d+)*$/i.test(q)) {
      try {
        const t = await svc.getTask(a, q);
        if (t.space.id === input.spaceId) push(t);
      } catch {
        // not found: fall through to text search
      }
    }
    const list = await svc.listTasks(a, {
      spaces: [input.spaceId],
      q,
      drafts: "include",
      sort: "ref",
      limit: limit + 2,
    });
    for (const t of list.items) push(t);
    return out.slice(0, limit).map(({ ref, title, status, type, archivedAt }) => ({ ref, title, status, type, archivedAt }));
  });
}
