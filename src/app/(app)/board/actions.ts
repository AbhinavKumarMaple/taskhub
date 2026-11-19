"use server";

import { runAction, runQuery } from "@/server/actions";
import * as svc from "@/server/service";
import type { ListTasksInput } from "@/server/validation";

export type MoveCardInput = {
  ref: string;
  status: string;
  beforeRef?: string;
  afterRef?: string;
  /** Swimlane drops: the lane's milestone ref, or null for "No milestone". Omit to keep it. */
  milestone?: string | null;
};

/** Drag and drop: optionally change the milestone (swimlanes), then set status and position. */
export async function moveCardAction(input: MoveCardInput) {
  return runAction(async (a) => {
    if (input.milestone !== undefined) await svc.updateTask(a, input.ref, { milestone: input.milestone });
    return svc.moveTask(a, {
      ref: input.ref,
      status: input.status,
      beforeRef: input.beforeRef,
      afterRef: input.afterRef,
    });
  });
}

export type AddCardInput = {
  title: string;
  status: string;
  spaceId?: string;
  type?: string;
  priority?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: string | null;
};

/** Inline "add task" from a column. Placed at the end of the column. */
export async function addCardAction(input: AddCardInput) {
  return runAction(async (a) => {
    const t = await svc.createTask(a, {
      spaceId: input.spaceId,
      title: input.title,
      status: input.status,
      type: input.type,
      priority: input.priority,
      labels: input.labels,
      assignees: input.assignees,
      milestone: input.milestone,
    });
    return { ref: t.ref };
  });
}

/** Column menu: archive Done tasks last updated more than `days` days ago. */
export async function cleanupDoneAction(days: number, space?: string) {
  return runAction((a) => svc.cleanupDone(a, { olderThanDays: days, spaces: space ? [space] : undefined }));
}

/** The board as markdown, with the same filters as the page. */
export async function exportBoardAction(filters: ListTasksInput) {
  return runQuery((a) => svc.exportBoardMarkdown(a, filters));
}

/** Cheap change marker for 5-second polling. */
export async function boardVersionAction(space?: string) {
  return runQuery((a) => svc.getVersion(a, { spaces: space ? [space] : undefined }));
}
