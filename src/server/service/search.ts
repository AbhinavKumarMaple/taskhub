import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { decisions, documents, spaces, tasks } from "../db/schema";
import { parse, searchInput } from "../validation";
import type { Access, SearchKind, SearchResult } from "@/lib/types";
import { allWordsMatch, archivedFilter, spaceRefCols, spaceScope, toSpaceRef, words } from "./context";

function snippet(body: string, ws: string[]): string {
  const lower = body.toLowerCase();
  let at = -1;
  for (const w of ws) {
    const i = lower.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return "";
  const start = Math.max(0, at - 60);
  const end = Math.min(body.length, at + 100);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${end < body.length ? "…" : ""}`;
}

function score(q: string, ws: string[], ref: string, title: string, body: string): number {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  let s = 0;
  if (ref.toLowerCase() === q.toLowerCase().trim()) s += 100;
  else if (ref.toLowerCase().startsWith(q.toLowerCase().trim())) s += 20;
  if (t.includes(q.toLowerCase().trim())) s += 5;
  for (const w of ws) {
    if (t.includes(w)) s += 3;
    else if (b.includes(w)) s += 1;
  }
  return s;
}

/**
 * Search tasks (ref, title, description, notes), documents (ref, title, body) and decisions
 * (ref, title, context, decision, consequences). Every word must match, in any order. Ranked title > body.
 */
export async function search(
  access: Access,
  q: string,
  opts: { types?: SearchKind[]; spaces?: string[]; includeArchived?: boolean; limit?: number } = {},
): Promise<SearchResult[]> {
  const p = parse(searchInput, { q, ...opts });
  const ws = words(p.q);
  if (!ws.length) return [];
  const kinds = new Set<SearchKind>(p.types?.length ? p.types : ["task", "document", "decision"]);
  const db = await getDb();
  const cap = 200;
  const arch = { includeArchived: p.includeArchived };
  const out: SearchResult[] = [];

  if (kinds.has("task")) {
    const rows = await db
      .select({ t: tasks, sp: spaceRefCols })
      .from(tasks)
      .innerJoin(spaces, eq(spaces.id, tasks.spaceId))
      .where(
        and(
          spaceScope(access, tasks.spaceId, p.spaces),
          archivedFilter(tasks.archivedAt, arch),
          allWordsMatch(p.q, [tasks.ref, tasks.title, tasks.description, tasks.notes]),
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(cap);
    for (const { t, sp } of rows) {
      const body = `${t.description}\n${t.notes}`;
      out.push({
        kind: "task",
        ref: t.ref,
        title: t.title,
        snippet: snippet(body, ws),
        space: toSpaceRef(sp),
        status: t.status,
        type: t.type,
        archived: !!t.archivedAt,
        score: score(p.q, ws, t.ref, t.title, body),
      });
    }
  }
  if (kinds.has("document")) {
    const rows = await db
      .select({ d: documents, sp: spaceRefCols })
      .from(documents)
      .innerJoin(spaces, eq(spaces.id, documents.spaceId))
      .where(
        and(
          spaceScope(access, documents.spaceId, p.spaces),
          archivedFilter(documents.archivedAt, arch),
          allWordsMatch(p.q, [documents.ref, documents.title, documents.body]),
        ),
      )
      .orderBy(desc(documents.updatedAt))
      .limit(cap);
    for (const { d, sp } of rows) {
      out.push({
        kind: "document",
        ref: d.ref,
        title: d.title,
        snippet: snippet(d.body, ws),
        space: toSpaceRef(sp),
        status: null,
        type: null,
        archived: !!d.archivedAt,
        score: score(p.q, ws, d.ref, d.title, d.body),
      });
    }
  }
  if (kinds.has("decision")) {
    const rows = await db
      .select({ d: decisions, sp: spaceRefCols })
      .from(decisions)
      .innerJoin(spaces, eq(spaces.id, decisions.spaceId))
      .where(
        and(
          spaceScope(access, decisions.spaceId, p.spaces),
          archivedFilter(decisions.archivedAt, arch),
          allWordsMatch(p.q, [decisions.ref, decisions.title, decisions.context, decisions.decision, decisions.consequences]),
        ),
      )
      .orderBy(desc(decisions.updatedAt))
      .limit(cap);
    for (const { d, sp } of rows) {
      const body = `${d.context}\n${d.decision}\n${d.consequences}`;
      out.push({
        kind: "decision",
        ref: d.ref,
        title: d.title,
        snippet: snippet(body, ws),
        space: toSpaceRef(sp),
        status: d.status,
        type: null,
        archived: !!d.archivedAt,
        score: score(p.q, ws, d.ref, d.title, body),
      });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, p.limit ?? 50);
}
