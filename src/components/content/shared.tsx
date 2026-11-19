"use client";

import { Archive, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { withParams } from "@/lib/nav";
import type { DecisionStatus, SpaceRef } from "@/lib/types";

/** Space picker for create forms. Archived Spaces are left out by the caller. */
export function SpaceSelect({
  spaces,
  value,
  onChange,
  id,
}: {
  spaces: SpaceRef[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={spaces.length === 1 ? undefined : "Choose a Space"}
      options={spaces.map((s) => ({ value: s.id, label: s.name }))}
    />
  );
}

/** Default Space for a create form: the selected one, else the only one, else none. */
export function defaultSpaceId(spaces: SpaceRef[], selected?: string | null): string {
  if (selected && spaces.some((s) => s.id === selected)) return selected;
  return spaces.length === 1 ? spaces[0].id : "";
}

/**
 * Search box (`?q=`, debounced) plus a "Show archived" toggle (`?archived=1`). Keeps every other param,
 * including `?space=`.
 */
export function ListToolbar({ placeholder, children }: { placeholder: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const last = useRef(urlQ);

  // Follow back/forward navigation.
  useEffect(() => {
    if (urlQ !== last.current) {
      last.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    if (q === last.current) return;
    const t = setTimeout(() => {
      last.current = q;
      router.replace(withParams(sp, { q: q.trim() || null }, pathname), { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, sp, pathname, router]);

  const archived = sp.get("archived") === "1";
  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <Input
        icon={<Search />}
        inputSize="sm"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-64 max-w-full"
        type="search"
      />
      {children}
      <Link
        href={withParams(sp, { archived: archived ? null : "1" }, pathname)}
        scroll={false}
        aria-pressed={archived}
        className={cn(
          "ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
          archived
            ? "border-accent bg-accent-soft text-accent-soft-fg"
            : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Archive className="size-3.5" aria-hidden />
        {archived ? "Showing archived" : "Show archived"}
      </Link>
    </div>
  );
}

const DECISION_TONE: Record<DecisionStatus, ChipTone> = {
  proposed: "accent",
  accepted: "done",
  rejected: "danger",
  superseded: "neutral",
};

export function DecisionStatusChip({ status, size }: { status: DecisionStatus; size?: "xs" | "sm" }) {
  return (
    <Chip tone={DECISION_TONE[status] ?? "neutral"} dot size={size} className="capitalize">
      {status}
    </Chip>
  );
}

export function ArchivedChip() {
  return (
    <Chip tone="outline" size="xs" icon={<Archive className="size-3" aria-hidden />}>
      Archived
    </Chip>
  );
}

/** Small "Created … · Updated …" line. */
export function MetaLine({ items }: { items: (string | false | null | undefined)[] }) {
  return <p className="text-xs text-fg-subtle">{items.filter(Boolean).join(" · ")}</p>;
}
