"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { withParams } from "@/lib/nav";
import { MultiSelect } from "./multi-select";

const FILTER_KEYS = ["q", "status", "xstatus", "type", "priority", "label", "assignee", "milestone"] as const;

const list = (s: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

/** URL-driven filters for the All tasks table. Any change resets the page to 1. */
export function TaskFilters({
  statuses,
  types,
  priorities,
  labels,
  milestones,
}: {
  statuses: string[];
  types: string[];
  priorities: string[];
  labels: string[];
  milestones: { ref: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [assignee, setAssignee] = useState(sp.get("assignee") ?? "");

  const set = (changes: Record<string, string | null>) => {
    startTransition(() => router.replace(withParams(sp, { ...changes, page: null }, pathname), { scroll: false }));
  };

  // Debounce the text fields into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q.trim() || (sp.get("assignee") ?? "") !== assignee.trim())
        set({ q: q.trim() || null, assignee: assignee.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, assignee]);

  const active = FILTER_KEYS.some((k) => sp.get(k));
  const multi = (key: string) => ({
    value: list(sp.get(key)),
    onChange: (v: string[]) => set({ [key]: v.length ? v.join(",") : null }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3" aria-busy={pending || undefined}>
      <Input
        icon={<Search />}
        placeholder="Search title, description, notes…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search tasks"
        className="w-64"
      />
      <MultiSelect label="Status" options={opts(statuses)} {...multi("status")} />
      <MultiSelect label="Exclude status" options={opts(statuses)} {...multi("xstatus")} />
      <MultiSelect label="Type" options={opts(types)} {...multi("type")} />
      <MultiSelect label="Priority" options={opts(priorities)} {...multi("priority")} />
      <MultiSelect label="Labels" options={opts(labels)} {...multi("label")} />
      <Select
        aria-label="Milestone"
        value={sp.get("milestone") ?? ""}
        onChange={(e) => set({ milestone: e.target.value || null })}
        placeholder="Any milestone"
        options={[{ value: "none", label: "No milestone" }, ...milestones.map((m) => ({ value: m.ref, label: `${m.ref} · ${m.title}` }))]}
        className="w-44"
      />
      <Input
        placeholder="Assignee"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        aria-label="Assignee"
        className="w-32"
      />
      {active && (
        <Button
          variant="ghost"
          size="sm"
          icon={<X className="size-3.5" />}
          onClick={() => {
            setQ("");
            setAssignee("");
            set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
