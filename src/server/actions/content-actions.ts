"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/actions";
import { safeNext } from "@/server/session";
import * as svc from "@/server/service";
import type { DecisionStatus, SpaceColor } from "@/lib/types";
import type { UpdateSettingsInput } from "@/server/validation";

// Server Actions for milestones, documents, decisions, Spaces and settings.
// Every action re-checks the owner session through runAction and calls the service layer only.

// ── Milestones ───────────────────────────────────────────────────────────────
export async function createMilestoneAction(input: {
  spaceId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
}) {
  return runAction((a) => svc.createMilestone(a, input));
}

export async function updateMilestoneAction(
  ref: string,
  input: { title?: string; description?: string; dueDate?: string | null },
) {
  return runAction((a) => svc.updateMilestone(a, ref, input));
}

export async function archiveMilestoneAction(ref: string) {
  return runAction((a) => svc.archiveMilestone(a, ref));
}

export async function restoreMilestoneAction(ref: string) {
  return runAction((a) => svc.restoreMilestone(a, ref));
}

export async function deleteMilestoneAction(ref: string) {
  return runAction((a) => svc.deleteMilestone(a, ref));
}

// ── Documents ────────────────────────────────────────────────────────────────
export async function createDocumentAction(input: { spaceId: string; title: string; body?: string }) {
  return runAction((a) => svc.createDocument(a, input));
}

export async function updateDocumentAction(ref: string, input: { title?: string; body?: string }) {
  return runAction((a) => svc.updateDocument(a, ref, input));
}

export async function archiveDocumentAction(ref: string) {
  return runAction((a) => svc.archiveDocument(a, ref));
}

export async function restoreDocumentAction(ref: string) {
  return runAction((a) => svc.restoreDocument(a, ref));
}

/** With `redirectTo`, navigates there on success instead of re-rendering the (now missing) detail page. */
export async function deleteDocumentAction(ref: string, redirectTo?: string) {
  return deleteThenGo(() => runAction((a) => svc.deleteDocument(a, ref), { refresh: !redirectTo }), redirectTo);
}

// ── Decisions ────────────────────────────────────────────────────────────────
type DecisionInput = {
  title?: string;
  status?: DecisionStatus;
  context?: string;
  decision?: string;
  consequences?: string;
};

export async function createDecisionAction(input: DecisionInput & { spaceId: string; title: string }) {
  return runAction((a) => svc.createDecision(a, input));
}

export async function updateDecisionAction(ref: string, input: DecisionInput) {
  return runAction((a) => svc.updateDecision(a, ref, input));
}

export async function archiveDecisionAction(ref: string) {
  return runAction((a) => svc.archiveDecision(a, ref));
}

export async function restoreDecisionAction(ref: string) {
  return runAction((a) => svc.restoreDecision(a, ref));
}

/** With `redirectTo`, navigates there on success instead of re-rendering the (now missing) detail page. */
export async function deleteDecisionAction(ref: string, redirectTo?: string) {
  return deleteThenGo(() => runAction((a) => svc.deleteDecision(a, ref), { refresh: !redirectTo }), redirectTo);
}

async function deleteThenGo<T>(fn: () => Promise<ActionResult<T>>, redirectTo?: string): Promise<ActionResult<T>> {
  const r = await fn();
  if (r.ok && redirectTo) redirect(safeNext(redirectTo));
  return r;
}

// ── Spaces ───────────────────────────────────────────────────────────────────
export async function createSpaceAction(input: { name: string; description?: string; color?: SpaceColor }) {
  return runAction((a) => svc.createSpace(a, input));
}

export async function updateSpaceAction(
  id: string,
  input: { name?: string; description?: string; color?: SpaceColor },
) {
  return runAction((a) => svc.updateSpace(a, id, input));
}

export async function regenerateSpaceKeyAction(id: string) {
  return runAction((a) => svc.regenerateKey(a, id));
}

export async function archiveSpaceAction(id: string) {
  return runAction((a) => svc.archiveSpace(a, id));
}

export async function restoreSpaceAction(id: string) {
  return runAction((a) => svc.restoreSpace(a, id));
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function updateSettingsAction(input: UpdateSettingsInput) {
  return runAction((a) => svc.updateSettings(a, input));
}
