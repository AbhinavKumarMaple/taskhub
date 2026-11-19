import { refresh } from "next/cache";
import type { Access } from "@/lib/types";
import { requireOwner } from "./auth";
import { isAppError, type ErrorCode } from "./errors";

/** What every Server Action returns to the client (never throws for expected errors). */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };

/**
 * Server Action wrapper: re-checks the owner session (redirects to /login), runs `fn` with owner Access,
 * then calls `refresh()` so the current route (layout counts included) re-renders in the same round trip.
 * AppErrors (NotFound/Invalid/Conflict/…) become `{ ok: false, error }`; anything else is rethrown.
 *
 *   "use server";
 *   export async function archiveTaskAction(ref: string) {
 *     return runAction((access) => archiveTask(access, ref));
 *   }
 */
export async function runAction<T>(
  fn: (access: Access) => Promise<T>,
  opts: { refresh?: boolean } = {},
): Promise<ActionResult<T>> {
  const access = await requireOwner();
  try {
    const data = await fn(access);
    if (opts.refresh !== false) refresh();
    return { ok: true, data };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

/** Read-only variant (no refresh), e.g. palette search or lazy loads. */
export function runQuery<T>(fn: (access: Access) => Promise<T>): Promise<ActionResult<T>> {
  return runAction(fn, { refresh: false });
}
