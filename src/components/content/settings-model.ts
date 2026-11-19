/** Pure helpers behind the Settings editor: rows with their saved value, turned into an update payload. */

export type ListRow = {
  /** Stable React key. */
  id: string;
  /** The saved value this row started from; null for a row added in this edit. */
  original: string | null;
  value: string;
};

let seq = 0;
const nextId = () => `row-${++seq}`;

export function rowsFrom(values: string[]): ListRow[] {
  return values.map((v) => ({ id: nextId(), original: v, value: v }));
}

export function newRow(value: string): ListRow {
  return { id: nextId(), original: null, value };
}

export function moveRow<T>(rows: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export type ListPlan =
  | { ok: true; values: string[]; renames: { from: string; to: string }[]; removed: string[]; added: string[] }
  | { ok: false; error: string };

/**
 * Turns edited rows into the values list + renames the service expects.
 * Rejects empty values, duplicates, and a rename onto a value that already exists (that would merge two
 * groups of tasks into one; rename the other value first).
 */
export function planList(
  rows: ListRow[],
  saved: string[],
  opts: { allowEmptyList?: boolean; renames?: boolean; maxLength?: number } = {},
): ListPlan {
  const maxLength = opts.maxLength ?? 100;
  const values = rows.map((r) => r.value.trim());
  if (values.some((v) => !v)) return { ok: false, error: "Values cannot be empty. Remove the empty row or fill it in." };
  const long = values.find((v) => v.length > maxLength);
  if (long) return { ok: false, error: `“${long.slice(0, 20)}…” is longer than ${maxLength} characters.` };
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return { ok: false, error: `“${v}” appears twice. Each value must be unique.` };
    seen.add(v);
  }
  if (!opts.allowEmptyList && values.length === 0) return { ok: false, error: "Keep at least one value." };

  const renames: { from: string; to: string }[] = [];
  if (opts.renames !== false) {
    rows.forEach((r, i) => {
      if (r.original !== null && values[i] !== r.original) renames.push({ from: r.original, to: values[i] });
    });
    for (const r of renames) {
      if (saved.includes(r.to)) {
        return {
          ok: false,
          error: `Cannot rename “${r.from}” to “${r.to}”: “${r.to}” already exists. Rename or remove the other one first.`,
        };
      }
    }
  }
  const kept = new Set(rows.map((r) => r.original).filter((v): v is string => v !== null));
  const removed = saved.filter((v) => !kept.has(v));
  const added = rows.filter((r) => r.original === null).map((r) => r.value.trim());
  return { ok: true, values, renames, removed, added };
}

/** True when the rows differ from the saved list (order included). */
export function isDirty(rows: ListRow[], saved: string[]): boolean {
  return rows.length !== saved.length || rows.some((r, i) => r.value.trim() !== saved[i] || r.original !== saved[i]);
}
