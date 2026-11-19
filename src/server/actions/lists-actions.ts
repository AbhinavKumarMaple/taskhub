"use server";

import { runAction, runQuery } from "@/server/actions";
import * as svc from "@/server/service";

/** Server Actions used by the list pages (All tasks, Drafts, Archive, Activity). */

export async function promoteDraftAction(ref: string) {
  return runAction((a) => svc.promoteDraft(a, ref).then((t) => ({ ref: t.ref })));
}

export type ArchiveKind = "task" | "document" | "decision" | "milestone";

export async function restoreArchivedAction(kind: ArchiveKind, ref: string) {
  return runAction(async (a) => {
    if (kind === "task") await svc.restoreTask(a, ref);
    else if (kind === "document") await svc.restoreDocument(a, ref);
    else if (kind === "decision") await svc.restoreDecision(a, ref);
    else await svc.restoreMilestone(a, ref);
    return { ref };
  });
}

export async function deleteArchivedAction(kind: ArchiveKind, ref: string) {
  return runAction(async (a) => {
    if (kind === "task") return svc.deleteTask(a, ref);
    if (kind === "document") return svc.deleteDocument(a, ref);
    if (kind === "decision") return svc.deleteDecision(a, ref);
    return svc.deleteMilestone(a, ref);
  });
}

/** One more page of the activity timeline (older than `before`). */
export async function loadActivityAction(input: { spaceId?: string; actor?: string; before: number }) {
  return runQuery((a) =>
    svc.listActivity(a, { spaceId: input.spaceId, actor: input.actor, before: input.before, limit: 50 }),
  );
}
