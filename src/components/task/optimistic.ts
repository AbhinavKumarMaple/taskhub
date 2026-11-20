/**
 * Client-side mirror of `updateTask` used for optimistic UI. Applies an UpdateTaskInput patch to a TaskFull
 * so the detail view changes at once; the server result replaces it when the action returns.
 * Checklist op order matches the service: set, then edit/check/uncheck/reorder/remove by 1-based index into
 * the list as it stood after `set`, then add.
 */

import type { ChecklistItem, Milestone, SpaceRef, TaskFull } from "@/lib/types";
import type { UpdateTaskInput } from "@/server/validation";

export type OptimisticContext = { milestones?: Pick<Milestone, "ref" | "title">[]; spaces?: SpaceRef[] };

type Ops = {
  set?: string[];
  check?: number[];
  uncheck?: number[];
  remove?: number[];
  edit?: { index: number; text: string }[];
  reorder?: number[];
  add?: string[];
};

let tempId = -1;

export function applyChecklist(current: ChecklistItem[], ops: Ops): ChecklistItem[] {
  let list = current.map((c) => ({ ...c }));
  if (ops.set) {
    const pool = [...list];
    list = ops.set.map((text) => {
      const i = pool.findIndex((p) => p.text.trim() === text.trim());
      const hit = i >= 0 ? pool.splice(i, 1)[0] : null;
      return { id: hit?.id ?? tempId--, text, checked: hit?.checked ?? false, position: 0 };
    });
  }
  const at = (i: number) => list[i - 1];
  for (const e of ops.edit ?? []) if (at(e.index)) at(e.index).text = e.text.trim();
  for (const i of ops.check ?? []) if (at(i)) at(i).checked = true;
  for (const i of ops.uncheck ?? []) if (at(i)) at(i).checked = false;
  // Remove indexes refer to the list after `set` (before reorder), like the service.
  const drop = new Set((ops.remove ?? []).map((i) => list[i - 1]).filter(Boolean));
  if (ops.reorder && ops.reorder.length === list.length) {
    const next = ops.reorder.map((i) => list[i - 1]).filter(Boolean);
    if (next.length === list.length) list = next;
  }
  if (drop.size) list = list.filter((x) => !drop.has(x));
  for (const text of ops.add ?? []) list.push({ id: tempId--, text: text.trim(), checked: false, position: 0 });
  return list.map((x, i) => ({ ...x, position: i + 1 }));
}

const SCALARS = [
  "title",
  "description",
  "status",
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
  "deployable",
] as const;

export function applyOptimistic(task: TaskFull, patch: UpdateTaskInput, ctx: OptimisticContext = {}): TaskFull {
  const next: TaskFull = { ...task };
  const rec = next as unknown as Record<string, unknown>;
  for (const k of SCALARS) {
    const v = patch[k];
    if (v !== undefined) rec[k] = typeof v === "string" && k === "title" ? v.trim() : v;
  }
  if (patch.labels) next.labels = [...new Set(patch.labels)];
  if (patch.addLabels || patch.removeLabels) {
    next.labels = [...new Set([...next.labels, ...(patch.addLabels ?? [])])].filter(
      (l) => !(patch.removeLabels ?? []).includes(l),
    );
  }
  if (patch.appendNotes) next.notes = next.notes ? `${next.notes}\n\n${patch.appendNotes}` : patch.appendNotes;
  if (patch.appendPlan) next.plan = next.plan ? `${next.plan}\n\n${patch.appendPlan}` : patch.appendPlan;
  if (patch.milestone !== undefined) {
    if (patch.milestone === null) next.milestone = null;
    else {
      const ref = patch.milestone.toUpperCase();
      const m = ctx.milestones?.find((x) => x.ref === ref);
      next.milestone = { ref, title: m?.title ?? ref };
    }
  }
  if (patch.spaceId && patch.spaceId !== task.space.id) {
    const s = ctx.spaces?.find((x) => x.id === patch.spaceId);
    if (s) next.space = s;
    next.milestone = patch.milestone ? next.milestone : null;
  }
  const ac: Ops = {
    set: patch.setAc,
    check: patch.checkAc,
    uncheck: patch.uncheckAc,
    remove: patch.removeAc,
    edit: patch.editAc,
    reorder: patch.reorderAc,
    add: patch.addAc,
  };
  if (Object.values(ac).some(Boolean)) {
    next.acceptanceCriteria = applyChecklist(task.acceptanceCriteria, ac);
    next.acTotal = next.acceptanceCriteria.length;
    next.acDone = next.acceptanceCriteria.filter((x) => x.checked).length;
  }
  const dod: Ops = {
    set: patch.setDod,
    check: patch.checkDod,
    uncheck: patch.uncheckDod,
    remove: patch.removeDod,
    edit: patch.editDod,
    reorder: patch.reorderDod,
    add: patch.addDod,
  };
  if (Object.values(dod).some(Boolean)) {
    next.definitionOfDone = applyChecklist(task.definitionOfDone, dod);
    next.dodTotal = next.definitionOfDone.length;
    next.dodDone = next.definitionOfDone.filter((x) => x.checked).length;
  }
  if (patch.removeDeps?.length) {
    const drop = new Set(patch.removeDeps.map((r) => r.toUpperCase()));
    // Depth-first order: a removed direct dep takes the deeper rows under it along.
    let skipping = false;
    next.dependsOn = task.dependsOn.filter((d) => {
      if (d.depth === 1) skipping = drop.has(d.ref);
      return !skipping;
    });
  }
  return next;
}
