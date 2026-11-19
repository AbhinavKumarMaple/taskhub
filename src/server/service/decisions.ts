import { and, desc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { decisions, spaces, type DecisionRow } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import {
  createDecisionInput,
  decisionRef,
  listEntitiesInput,
  parse,
  updateDecisionInput,
  type ListEntitiesInput,
} from "../validation";
import type { Access, DecisionFull, DecisionStatus, DecisionSummary } from "@/lib/types";
import {
  allWordsMatch,
  archivedFilter,
  assertSpace,
  diff,
  logActivity,
  nextCounter,
  resolveCreateSpace,
  spaceRefCols,
  spaceScope,
  toSpaceRef,
  withTx,
} from "./context";

async function load(q: DbOrTx, access: Access, ref: string): Promise<DecisionRow> {
  const r = parse(decisionRef, ref);
  const [row] = await q.select().from(decisions).where(eq(decisions.ref, r));
  if (!row) throw new NotFound(`Decision ${r} not found`);
  assertSpace(access, row.spaceId, `Decision ${r} not found`);
  return row;
}

function summary(d: DecisionRow, sp: { id: string; name: string; color: string }): DecisionSummary {
  return {
    id: d.id,
    ref: d.ref,
    space: toSpaceRef(sp),
    title: d.title,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    archivedAt: d.archivedAt,
  };
}

async function full(q: DbOrTx, id: number): Promise<DecisionFull> {
  const [r] = await q
    .select({ d: decisions, sp: spaceRefCols })
    .from(decisions)
    .innerJoin(spaces, eq(spaces.id, decisions.spaceId))
    .where(eq(decisions.id, id));
  return { ...summary(r.d, r.sp), context: r.d.context, decision: r.d.decision, consequences: r.d.consequences };
}

type DecisionFields = {
  title?: string;
  status?: DecisionStatus;
  context?: string;
  decision?: string;
  consequences?: string;
};

export async function createDecision(
  access: Access,
  input: DecisionFields & { spaceId?: string; title: string },
): Promise<DecisionFull> {
  const p = parse(createDecisionInput, input);
  const spaceId = resolveCreateSpace(access, p.spaceId);
  const id = await withTx(async (tx) => {
    const [sp] = await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId));
    if (!sp) throw new NotFound("Space not found");
    const ref = `DEC-${await nextCounter(tx, "decision")}`;
    const [row] = await tx
      .insert(decisions)
      .values({
        ref,
        spaceId,
        title: p.title,
        status: p.status ?? "proposed",
        context: p.context ?? "",
        decision: p.decision ?? "",
        consequences: p.consequences ?? "",
      })
      .returning();
    await logActivity(tx, access, {
      spaceId,
      entityType: "decision",
      entityRef: ref,
      action: "created",
      summary: `Recorded decision ${ref} "${row.title}" (${row.status})`,
      changes: { title: { from: null, to: row.title }, status: { from: null, to: row.status } },
    });
    return row.id;
  });
  return full(await getDb(), id);
}

/** Decisions in the caller's Spaces, newest first. */
export async function listDecisions(access: Access, input: ListEntitiesInput = {}): Promise<DecisionSummary[]> {
  const p = parse(listEntitiesInput, input);
  const q = await getDb();
  const rows = await q
    .select({ d: decisions, sp: spaceRefCols })
    .from(decisions)
    .innerJoin(spaces, eq(spaces.id, decisions.spaceId))
    .where(
      and(
        spaceScope(access, decisions.spaceId, p.spaces),
        archivedFilter(decisions.archivedAt, p),
        p.status ? eq(decisions.status, p.status) : undefined,
        allWordsMatch(p.q, [decisions.ref, decisions.title, decisions.context, decisions.decision, decisions.consequences]),
      ),
    )
    .orderBy(desc(decisions.createdAt), desc(decisions.id));
  return rows.map((r) => summary(r.d, r.sp));
}

export async function getDecision(access: Access, ref: string): Promise<DecisionFull> {
  const q = await getDb();
  const d = await load(q, access, ref);
  return full(q, d.id);
}

export async function updateDecision(access: Access, ref: string, input: DecisionFields): Promise<DecisionFull> {
  const p = parse(updateDecisionInput, input);
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    const changes = diff(cur, p);
    if (!Object.keys(changes).length) return cur.id;
    await tx
      .update(decisions)
      .set({ ...p, updatedAt: new Date() })
      .where(eq(decisions.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "decision",
      entityRef: cur.ref,
      action: changes.status ? "status" : "updated",
      summary: changes.status
        ? `Decision ${cur.ref} "${cur.title}": ${cur.status} → ${p.status}`
        : `Updated decision ${cur.ref} (${Object.keys(changes).join(", ")})`,
      changes,
    });
    return cur.id;
  });
  return full(await getDb(), id);
}

async function setArchived(access: Access, ref: string, archived: boolean): Promise<DecisionFull> {
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!!cur.archivedAt === archived) return cur.id;
    await tx
      .update(decisions)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(decisions.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "decision",
      entityRef: cur.ref,
      action: archived ? "archived" : "restored",
      summary: `${archived ? "Archived" : "Restored"} decision ${cur.ref} "${cur.title}"`,
      changes: { archived: { from: !archived, to: archived } },
    });
    return cur.id;
  });
  return full(await getDb(), id);
}

export const archiveDecision = (access: Access, ref: string) => setArchived(access, ref, true);
export const restoreDecision = (access: Access, ref: string) => setArchived(access, ref, false);

export async function deleteDecision(access: Access, ref: string): Promise<{ ref: string; deleted: true }> {
  return withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!cur.archivedAt) throw new Invalid(`Archive ${cur.ref} before deleting it`);
    await tx.delete(decisions).where(eq(decisions.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "decision",
      entityRef: cur.ref,
      action: "deleted",
      summary: `Deleted decision ${cur.ref} "${cur.title}"`,
    });
    return { ref: cur.ref, deleted: true as const };
  });
}
