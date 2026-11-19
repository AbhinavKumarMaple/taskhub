"use client";

import { Download, Rows3, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { exportBoardAction } from "@/app/(app)/board/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { NewTaskButton } from "@/components/lists/new-draft-button";
import { withParams } from "@/lib/nav";
import { pluralize } from "@/lib/format";
import type { SpaceRef } from "@/lib/types";
import type { ListTasksInput } from "@/server/validation";

const FILTER_KEYS = ["type", "label", "priority", "assignee", "milestone", "q"] as const;
/** The main view: features only. "Clear filters" returns here, and it does not count as a filter. */
const DEFAULT_TYPE = "feature";

export type BoardFilterBarProps = {
  spaces: SpaceRef[];
  types: string[];
  priorities: string[];
  labels: string[];
  assignees: string[];
  milestones: { ref: string; title: string }[];
  /** Same filters as the page, for "Export markdown". */
  exportFilters: ListTasksInput;
  total: number;
};

/** Board filters, all kept in the URL. */
export function BoardFilterBar({
  spaces,
  types,
  priorities,
  labels,
  assignees,
  milestones,
  exportFilters,
  total,
}: BoardFilterBarProps) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const set = (changes: Record<string, string | null>) => {
    const url = withParams(sp, changes, pathname);
    startTransition(() => router.replace(url, { scroll: false }));
  };

  // Search box: local value, pushed to the URL after a short pause.
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const lastPushed = useRef(urlQ);
  useEffect(() => {
    // URL changed from elsewhere (back button, clear filters): follow it.
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);
  useEffect(() => {
    if (q === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = q;
      set({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const grouped = sp.get("group") === "milestone";
  const active = FILTER_KEYS.filter((k) => (k === "type" ? (sp.get("type") ?? "") !== DEFAULT_TYPE : !!sp.get(k)));
  const hasFilters = active.length > 0;

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportBoardAction(exportFilters);
      if (!res.ok) {
        toast.error("Export failed", res.error);
        return;
      }
      const blob = new Blob([res.data], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `board-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  };

  const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  const selectCls = "w-auto min-w-28 max-w-44";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-lg font-semibold tracking-tight">Board</h1>
        <span className="text-xs text-fg-subtle tabular-nums" aria-live="polite">
          {pluralize(total, "card")}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant={grouped ? "primary" : "secondary"}
            icon={<Rows3 className="size-3.5" aria-hidden />}
            aria-pressed={grouped}
            onClick={() => set({ group: grouped ? null : "milestone" })}
          >
            Group by milestone
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="size-3.5" aria-hidden />}
            loading={exporting}
            onClick={() => void onExport()}
          >
            Export markdown
          </Button>
          <NewTaskButton />
        </div>
      </div>

      <div role="search" aria-label="Board filters" className="flex flex-wrap items-center gap-2">
        <Input
          inputSize="sm"
          icon={<Search />}
          placeholder="Search cards"
          aria-label="Search cards"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && q) {
              e.preventDefault();
              setQ("");
            }
          }}
          className="w-56"
        />
        {spaces.length > 1 && (
          <Select
            selectSize="sm"
            aria-label="Space"
            className={selectCls}
            value={sp.get("space") ?? ""}
            onChange={(e) => set({ space: e.target.value || null, milestone: null })}
            placeholder="All Spaces"
            options={spaces.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        <Select
          selectSize="sm"
          aria-label="Type"
          className={selectCls}
          value={sp.get("type") ?? ""}
          onChange={(e) => set({ type: e.target.value || null })}
          placeholder="All types"
          options={opt(types)}
        />
        <Select
          selectSize="sm"
          aria-label="Priority"
          className={selectCls}
          value={sp.get("priority") ?? ""}
          onChange={(e) => set({ priority: e.target.value || null })}
          placeholder="Any priority"
          options={opt(priorities)}
        />
        <Select
          selectSize="sm"
          aria-label="Label"
          className={selectCls}
          value={sp.get("label") ?? ""}
          onChange={(e) => set({ label: e.target.value || null })}
          placeholder="Any label"
          options={opt(withCurrent(labels, sp.get("label")))}
        />
        <Select
          selectSize="sm"
          aria-label="Assignee"
          className={selectCls}
          value={sp.get("assignee") ?? ""}
          onChange={(e) => set({ assignee: e.target.value || null })}
          placeholder="Anyone"
          options={opt(withCurrent(assignees, sp.get("assignee")))}
        />
        <Select
          selectSize="sm"
          aria-label="Milestone"
          className={selectCls}
          value={(sp.get("milestone") ?? "").toUpperCase() === "NONE" ? "none" : (sp.get("milestone") ?? "").toUpperCase()}
          onChange={(e) => set({ milestone: e.target.value || null })}
          placeholder="Any milestone"
        >
          <option value="none">No milestone</option>
          {milestones.map((m) => (
            <option key={m.ref} value={m.ref}>
              {m.ref} · {m.title}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="size-3.5" aria-hidden />}
            onClick={() => {
              lastPushed.current = "";
              setQ("");
              set({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), type: DEFAULT_TYPE });
            }}
          >
            Clear filters
          </Button>
        )}
        <span className="sr-only">{hasFilters ? `${pluralize(active.length, "filter")} active` : "No filters"}</span>
      </div>
    </div>
  );
}

/** Keep the URL's current value selectable even when it is not in the list. */
function withCurrent(xs: string[], current: string | null): string[] {
  return current && !xs.includes(current) ? [...xs, current] : xs;
}
