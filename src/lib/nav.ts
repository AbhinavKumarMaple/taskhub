/** URL helpers shared by server pages and client components. The selected Space is `?space=`. */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** First value of a search param. */
export function param(sp: SearchParamsRecord | undefined, key: string): string | undefined {
  const v = sp?.[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === "" ? undefined : s;
}

/** All values of a search param, also splitting comma lists ("a,b"). */
export function paramList(sp: SearchParamsRecord | undefined, key: string): string[] {
  const v = sp?.[key];
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr
    .flatMap((x) => x.split(","))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The selected Space id (from `?space=`), or undefined for "All Spaces". */
export function selectedSpace(sp: SearchParamsRecord | undefined): string | undefined {
  const s = param(sp, "space");
  return s && /^sp_[a-z2-7]{10}$/.test(s) ? s : undefined;
}

/** `spaces` filter for service calls from the selected Space. */
export function spacesFilter(sp: SearchParamsRecord | undefined): string[] | undefined {
  const s = selectedSpace(sp);
  return s ? [s] : undefined;
}

/** Build `path?query` keeping the selected Space; `null`/`undefined`/"" values are dropped. */
export function href(
  path: string,
  params: Record<string, string | number | boolean | string[] | null | undefined> = {},
  space?: string | null,
): string {
  const q = new URLSearchParams();
  if (space) q.set("space", space);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) q.set(k, v.join(","));
    } else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Same URL with some params changed (null removes). */
export function withParams(
  current: URLSearchParams | string,
  changes: Record<string, string | number | null | undefined>,
  path?: string,
): string {
  const q = new URLSearchParams(typeof current === "string" ? current : current.toString());
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  return `${path ?? ""}${s ? `?${s}` : ""}` || "?";
}

export const taskHref = (ref: string, space?: string | null) => href(`/tasks/${ref}`, {}, space);
export const documentHref = (ref: string, space?: string | null) => href(`/documents/${ref}`, {}, space);
export const decisionHref = (ref: string, space?: string | null) => href(`/decisions/${ref}`, {}, space);

export const NAV_ITEMS = [
  { key: "board", label: "Board", path: "/board", params: { type: "feature" } },
  { key: "tasks", label: "All tasks", path: "/tasks" },
  { key: "drafts", label: "Drafts", path: "/drafts" },
  { key: "archive", label: "Archive", path: "/archive" },
  { key: "milestones", label: "Milestones", path: "/milestones" },
  { key: "documents", label: "Documents", path: "/documents" },
  { key: "decisions", label: "Decisions", path: "/decisions" },
  { key: "statistics", label: "Statistics", path: "/statistics" },
  { key: "activity", label: "Activity", path: "/activity" },
  { key: "spaces", label: "Spaces", path: "/spaces" },
  { key: "settings", label: "Settings", path: "/settings" },
  { key: "connect", label: "Connect", path: "/connect" },
] as const;
export type NavKey = (typeof NAV_ITEMS)[number]["key"];
