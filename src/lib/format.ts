/** Client-safe formatting helpers for dates and refs. */

type DateLike = Date | string | number | null | undefined;

const toDate = (d: DateLike): Date | null => {
  if (d === null || d === undefined || d === "") return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
};

/** "19 Nov 2026" (or "19 Nov" in the current year). */
export function formatDate(d: DateLike, opts: { alwaysYear?: boolean } = {}): string {
  const x = toDate(d);
  if (!x) return "";
  const sameYear = x.getFullYear() === new Date().getFullYear();
  return x.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear && !opts.alwaysYear ? {} : { year: "numeric" }),
  });
}

/** "19 Nov 2026, 14:05". */
export function formatDateTime(d: DateLike): string {
  const x = toDate(d);
  if (!x) return "";
  return `${formatDate(x, { alwaysYear: true })}, ${x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function relativeTime(d: DateLike, now: Date = new Date()): string {
  const x = toDate(d);
  if (!x) return "";
  const s = Math.round((now.getTime() - x.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(x);
}

/** How long something has been in a state: "for 5m", "for 3h", "for 4d", "for 2w", "since 3 Oct". */
export function durationSince(d: DateLike, now: Date = new Date()): string {
  const x = toDate(d);
  if (!x) return "";
  const m = Math.max(0, Math.round((now.getTime() - x.getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `for ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `for ${h}h`;
  const days = Math.round(h / 24);
  if (days < 14) return `for ${days}d`;
  if (days < 60) return `for ${Math.round(days / 7)}w`;
  return `since ${formatDate(x)}`;
}

/** Due date (YYYY-MM-DD) label + whether it is overdue/today. */
export function formatDue(due: string | null | undefined, now: Date = new Date()) {
  if (!due) return null;
  const today = now.toISOString().slice(0, 10);
  return {
    label: formatDate(`${due}T00:00:00`),
    overdue: due < today,
    today: due === today,
  };
}

/** "T-12.3" → { kind: "T", parts: [12, 3] }. Null when not a ref. */
export function parseRef(ref: string): { kind: "T" | "M" | "DOC" | "DEC"; parts: number[] } | null {
  const m = /^(T|M|DOC|DEC)-(\d+(?:\.\d+)*)$/i.exec(ref.trim());
  if (!m) return null;
  return { kind: m[1].toUpperCase() as "T" | "M" | "DOC" | "DEC", parts: m[2].split(".").map(Number) };
}

export const isTaskRef = (s: string) => /^T-\d+(\.\d+)*$/i.test(s.trim());

/** Natural ref order: T-2 < T-10 < T-10.1 < T-10.2. */
export function compareRefs(a: string, b: string): number {
  const pa = parseRef(a);
  const pb = parseRef(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.kind !== pb.kind) return pa.kind.localeCompare(pb.kind);
  for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
    const x = pa.parts[i] ?? -1;
    const y = pb.parts[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Parent ref of a child ref ("T-12.3" → "T-12"), or null for top level. */
export function parentRefOf(ref: string): string | null {
  const i = ref.lastIndexOf(".");
  return i > 0 ? ref.slice(0, i) : null;
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 of 5 complete". */
export function progressText(done: number, total: number) {
  return `${done} of ${total} complete`;
}

export function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

/** Masks a secret: "sk_ab…wxyz". */
export function maskSecret(s: string, show = 4) {
  if (s.length <= show * 2 + 3) return "•".repeat(s.length);
  return `${s.slice(0, 3 + 2)}${"•".repeat(10)}${s.slice(-show)}`;
}
