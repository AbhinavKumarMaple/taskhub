import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx, type Tx } from "../db";
import { activity, counters, spaces, type FieldChanges } from "../db/schema";
import { Forbidden, NotFound } from "../errors";
import type { Access, ActivityAction, EntityType, SpaceColor, SpaceRef } from "@/lib/types";

export type { Access };

/** Run `fn` in a transaction on the process database. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

export async function db(): Promise<DbOrTx> {
  return getDb();
}

export function isOwner(access: Access): boolean {
  return access.spaces === "all";
}

export function requireOwnerAccess(access: Access) {
  if (!isOwner(access)) throw new Forbidden();
}

export function canSeeSpace(access: Access, spaceId: string): boolean {
  return access.spaces === "all" || access.spaces.includes(spaceId);
}

/** Throws NotFound (never Forbidden) when the Space is outside the caller's access. */
export function assertSpace(access: Access, spaceId: string, what = "Not found") {
  if (!canSeeSpace(access, spaceId)) throw new NotFound(what);
}

/**
 * The Space ids a query may touch: `requested` (if any) intersected with access.
 * Returns 'all' only for owner access without a request.
 */
export function effectiveSpaces(access: Access, requested?: string[]): "all" | string[] {
  if (requested && requested.length) {
    return access.spaces === "all" ? requested : requested.filter((s) => access.spaces.includes(s));
  }
  return access.spaces;
}

/**
 * WHERE fragment restricting `col` (a space_id column) to the caller's Spaces.
 * Without an explicit request, archived Spaces are left out.
 */
export function spaceScope(access: Access, col: AnyPgColumn, requested?: string[]): SQL | undefined {
  const eff = effectiveSpaces(access, requested);
  const archivedSpaces = sql`(select ${spaces.id} from ${spaces} where ${spaces.archivedAt} is not null)`;
  if (eff === "all") return sql`${col} not in ${archivedSpaces}`;
  if (eff.length === 0) return sql`false`;
  if (requested && requested.length) return inArray(col, eff);
  return and(inArray(col, eff), sql`${col} not in ${archivedSpaces}`);
}

/** Pick the Space for a create: explicit, or the only one a chat holds. */
export function resolveCreateSpace(access: Access, spaceId: string | undefined): string {
  if (spaceId) {
    assertSpace(access, spaceId, "Space not found");
    return spaceId;
  }
  if (access.spaces !== "all" && access.spaces.length === 1) return access.spaces[0];
  throw new NotFound("Space not found: pass spaceId (or exactly one space key)");
}

export async function loadSpace(tx: DbOrTx, access: Access, id: string) {
  assertSpace(access, id, "Space not found");
  const [row] = await tx.select().from(spaces).where(eq(spaces.id, id));
  if (!row) throw new NotFound("Space not found");
  return row;
}

export function toSpaceRef(row: { id: string; name: string; color: string }): SpaceRef {
  return { id: row.id, name: row.name, color: row.color as SpaceColor };
}

/** Columns to select a SpaceRef from a join. */
export const spaceRefCols = { id: spaces.id, name: spaces.name, color: spaces.color };

export type ActivityInput = {
  spaceId: string | null;
  entityType: EntityType;
  entityRef: string;
  action: ActivityAction;
  summary: string;
  changes?: FieldChanges;
};

export async function logActivity(tx: DbOrTx, access: Access, a: ActivityInput) {
  await tx.insert(activity).values({
    spaceId: a.spaceId,
    entityType: a.entityType,
    entityRef: a.entityRef,
    action: a.action,
    actor: access.actor || "chat",
    summary: a.summary,
    changes: a.changes ?? {},
  });
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Field → {from,to} for every key in `after` that differs from `before`. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): FieldChanges {
  const out: FieldChanges = {};
  for (const k of Object.keys(after)) {
    if (after[k] === undefined) continue;
    if (!same(before[k], after[k])) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}

/** Atomically bump a named counter (milestone / document / decision) and return the new value. */
export async function nextCounter(tx: DbOrTx, name: "milestone" | "document" | "decision"): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ name, value: 1 })
    .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return row.value;
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += B32[bytes[i] & 31];
  return s;
}
export const newSpaceId = () => `sp_${randomBase32(10)}`;
export const newSpaceKey = () => `sk_${randomBase32(32)}`;

/** Escape LIKE wildcards in a user word. */
export function likeWord(word: string) {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function words(q: string | undefined): string[] {
  return (q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Every word must match at least one of `cols` (ILIKE), in any order. */
export function allWordsMatch(q: string | undefined, cols: (AnyPgColumn | SQL)[]): SQL | undefined {
  const ws = words(q);
  if (!ws.length) return undefined;
  return and(
    ...ws.map((w) => {
      const pat = likeWord(w);
      return sql`(${sql.join(
        cols.map((c) => sql`${c} ilike ${pat}`),
        sql` or `,
      )})`;
    }),
  );
}

export function archivedFilter(col: AnyPgColumn, opts: { includeArchived?: boolean; archivedOnly?: boolean }) {
  if (opts.archivedOnly) return isNotNull(col);
  if (opts.includeArchived) return undefined;
  return sql`${col} is null`;
}


/** Rows from `db.execute()` (PGlite and Neon both return `{ rows }`). */
export function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] })?.rows ?? []) as T[];
}
