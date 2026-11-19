"use client";

import { useCallback, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/actions";

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Runs a Server Action inside a transition. Expected errors (`{ ok: false }`) are kept in `error` for inline
 * display and, unless `inline` is set, also shown as a toast. Resolves to the data, or undefined on error.
 */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const run = useCallback(
    <T,>(
      fn: () => Promise<ActionResult<T>>,
      opts: { success?: string; inline?: boolean; errorTitle?: string } = {},
    ): Promise<T | undefined> =>
      new Promise((resolve) => {
        setError(null);
        startTransition(async () => {
          try {
            const r = await fn();
            if (r.ok) {
              if (opts.success) toast.success(opts.success);
              resolve(r.data);
            } else {
              setError(r.error);
              if (!opts.inline) toast.error(opts.errorTitle ?? "Could not save", r.error);
              resolve(undefined);
            }
          } catch (e) {
            // A redirect() from the action must reach Next's router boundary.
            if (isNextRedirect(e)) throw e;
            const msg = e instanceof Error ? e.message : "Something went wrong";
            setError(msg);
            toast.error(opts.errorTitle ?? "Something went wrong", msg);
            resolve(undefined);
          }
        });
      }),
    [toast],
  );

  return { run, pending, error, setError };
}
