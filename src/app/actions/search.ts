"use server";

import { runQuery } from "@/server/actions";
import { search } from "@/server/service";
import type { SearchKind } from "@/lib/types";

/** ⌘K palette search (tasks, documents, decisions), optionally limited to one Space. */
export async function searchAction(q: string, opts: { space?: string; types?: SearchKind[]; limit?: number } = {}) {
  return runQuery((access) =>
    search(access, q, {
      spaces: opts.space ? [opts.space] : undefined,
      types: opts.types,
      limit: opts.limit ?? 20,
      includeArchived: false,
    }),
  );
}
