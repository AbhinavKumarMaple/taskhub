import { and, desc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "../db";
import { documents, spaces, type DocumentRow } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import {
  createDocumentInput,
  documentRef,
  listEntitiesInput,
  parse,
  updateDocumentInput,
  type ListEntitiesInput,
} from "../validation";
import { fieldList } from "@/lib/field-labels";
import type { Access, DocumentFull, DocumentSummary } from "@/lib/types";
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

async function load(q: DbOrTx, access: Access, ref: string): Promise<DocumentRow> {
  const r = parse(documentRef, ref);
  const [row] = await q.select().from(documents).where(eq(documents.ref, r));
  if (!row) throw new NotFound(`Document ${r} not found`);
  assertSpace(access, row.spaceId, `Document ${r} not found`);
  return row;
}

function summary(d: DocumentRow, sp: { id: string; name: string; color: string }): DocumentSummary {
  return {
    id: d.id,
    ref: d.ref,
    space: toSpaceRef(sp),
    title: d.title,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    archivedAt: d.archivedAt,
  };
}

async function full(q: DbOrTx, id: number): Promise<DocumentFull> {
  const [r] = await q
    .select({ d: documents, sp: spaceRefCols })
    .from(documents)
    .innerJoin(spaces, eq(spaces.id, documents.spaceId))
    .where(eq(documents.id, id));
  return { ...summary(r.d, r.sp), body: r.d.body };
}

export async function createDocument(
  access: Access,
  input: { spaceId?: string; title: string; body?: string },
): Promise<DocumentFull> {
  const p = parse(createDocumentInput, input);
  const spaceId = resolveCreateSpace(access, p.spaceId);
  const id = await withTx(async (tx) => {
    const [sp] = await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, spaceId));
    if (!sp) throw new NotFound("Space not found");
    const ref = `DOC-${await nextCounter(tx, "document")}`;
    const [row] = await tx
      .insert(documents)
      .values({ ref, spaceId, title: p.title, body: p.body ?? "" })
      .returning();
    await logActivity(tx, access, {
      spaceId,
      entityType: "document",
      entityRef: ref,
      action: "created",
      summary: `Created document ${ref} "${row.title}"`,
      changes: { title: { from: null, to: row.title } },
    });
    return row.id;
  });
  return full(await getDb(), id);
}

/** Documents in the caller's Spaces, most recently updated first. `q` matches ref/title/body. */
export async function listDocuments(access: Access, input: ListEntitiesInput = {}): Promise<DocumentSummary[]> {
  const p = parse(listEntitiesInput, input);
  const q = await getDb();
  const rows = await q
    .select({ d: documents, sp: spaceRefCols })
    .from(documents)
    .innerJoin(spaces, eq(spaces.id, documents.spaceId))
    .where(
      and(
        spaceScope(access, documents.spaceId, p.spaces),
        archivedFilter(documents.archivedAt, p),
        allWordsMatch(p.q, [documents.ref, documents.title, documents.body]),
      ),
    )
    .orderBy(desc(documents.updatedAt), desc(documents.id));
  return rows.map((r) => summary(r.d, r.sp));
}

export async function getDocument(access: Access, ref: string): Promise<DocumentFull> {
  const q = await getDb();
  const d = await load(q, access, ref);
  return full(q, d.id);
}

export async function updateDocument(
  access: Access,
  ref: string,
  input: { title?: string; body?: string },
): Promise<DocumentFull> {
  const p = parse(updateDocumentInput, input);
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    const changes = diff(cur, p);
    if (!Object.keys(changes).length) return cur.id;
    await tx
      .update(documents)
      .set({ ...p, updatedAt: new Date() })
      .where(eq(documents.id, cur.id));
    // keep long bodies out of the diff
    if (changes.body) changes.body = { from: `${cur.body.length} chars`, to: `${(p.body ?? "").length} chars` };
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "document",
      entityRef: cur.ref,
      action: "updated",
      summary: `Updated document ${cur.ref} (${fieldList(Object.keys(changes))})`,
      changes,
    });
    return cur.id;
  });
  return full(await getDb(), id);
}

async function setArchived(access: Access, ref: string, archived: boolean): Promise<DocumentFull> {
  const id = await withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!!cur.archivedAt === archived) return cur.id;
    await tx
      .update(documents)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(documents.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "document",
      entityRef: cur.ref,
      action: archived ? "archived" : "restored",
      summary: `${archived ? "Archived" : "Restored"} document ${cur.ref} "${cur.title}"`,
      changes: { archived: { from: !archived, to: archived } },
    });
    return cur.id;
  });
  return full(await getDb(), id);
}

export const archiveDocument = (access: Access, ref: string) => setArchived(access, ref, true);
export const restoreDocument = (access: Access, ref: string) => setArchived(access, ref, false);

export async function deleteDocument(access: Access, ref: string): Promise<{ ref: string; deleted: true }> {
  return withTx(async (tx) => {
    const cur = await load(tx, access, ref);
    if (!cur.archivedAt) throw new Invalid(`Archive ${cur.ref} before deleting it`);
    await tx.delete(documents).where(eq(documents.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "document",
      entityRef: cur.ref,
      action: "deleted",
      summary: `Deleted document ${cur.ref} "${cur.title}"`,
    });
    return { ref: cur.ref, deleted: true as const };
  });
}
