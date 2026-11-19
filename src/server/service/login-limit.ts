import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { loginFailures } from "../db/schema";

/** Failed sign-ins allowed per client inside one window before it is locked out. */
export const LOGIN_MAX_FAILURES = 10;
/** Window length, and how long a lockout lasts after the last allowed failure. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Seconds until `client` may try to sign in again, or 0 when it may try now. Stored in the database
 * so every server instance shares the count.
 */
export async function loginRetryAfter(client: string, now = new Date()): Promise<number> {
  const db = await getDb();
  const [row] = await db.select().from(loginFailures).where(eq(loginFailures.client, client));
  if (!row || row.count < LOGIN_MAX_FAILURES) return 0;
  const left = row.windowStart.getTime() + LOGIN_WINDOW_MS - now.getTime();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Count one failed sign-in for `client` (a fresh window starts once the old one has passed). */
export async function recordLoginFailure(client: string, now = new Date()): Promise<void> {
  const db = await getDb();
  const at = sql`${now.toISOString()}::timestamptz`;
  const cutoff = sql`${new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString()}::timestamptz`;
  await db
    .insert(loginFailures)
    .values({ client, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: loginFailures.client,
      set: {
        count: sql`case when ${loginFailures.windowStart} < ${cutoff} then 1 else ${loginFailures.count} + 1 end`,
        windowStart: sql`case when ${loginFailures.windowStart} < ${cutoff} then ${at} else ${loginFailures.windowStart} end`,
      },
    });
  // Keep the table small: forget clients whose window ended a day ago.
  await db.delete(loginFailures).where(sql`${loginFailures.windowStart} < ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz`);
}

/** A successful sign-in clears the client's failures. */
export async function clearLoginFailures(client: string): Promise<void> {
  const db = await getDb();
  await db.delete(loginFailures).where(eq(loginFailures.client, client));
}
