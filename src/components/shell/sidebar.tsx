"use client";

import {
  Activity,
  Archive,
  BarChart3,
  Check,
  ChevronsUpDown,
  FileText,
  Flag,
  KanbanSquare,
  Layers,
  LayoutGrid,
  List,
  LogOut,
  NotebookPen,
  Plug,
  Scale,
  Search,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SpaceDot } from "@/components/ui/chip";
import { Kbd } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/cn";
import { href, NAV_ITEMS, type NavKey } from "@/lib/nav";
import type { NavCounts, SpaceColor } from "@/lib/types";
import { useShell } from "./app-shell";
import { CommandPalette, openPalette } from "./command-palette";

export type SidebarSpace = { id: string; name: string; color: SpaceColor };

const ICONS: Record<NavKey, typeof List> = {
  board: KanbanSquare,
  tasks: List,
  drafts: NotebookPen,
  archive: Archive,
  milestones: Flag,
  documents: FileText,
  decisions: Scale,
  statistics: BarChart3,
  activity: Activity,
  spaces: Layers,
  settings: Settings,
  connect: Plug,
};

const COUNTED: Partial<Record<NavKey, keyof NavCounts>> = {
  board: "board",
  tasks: "tasks",
  drafts: "drafts",
  archive: "archive",
  milestones: "milestones",
  documents: "documents",
  decisions: "decisions",
};

/** Detail routes fall back to their list when the Space changes. */
function listPathFor(pathname: string) {
  const m = /^\/(tasks|documents|decisions)\/[^/]+/.exec(pathname);
  return m ? `/${m[1]}` : pathname;
}

function SpaceSwitcher({ spaces, current }: { spaces: SidebarSpace[]; current?: SidebarSpace }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (id: string | null) => {
    setOpen(false);
    const q = new URLSearchParams(sp.toString());
    q.delete("task");
    q.delete("page");
    if (id) q.set("space", id);
    else q.delete("space");
    const s = q.toString();
    router.push(`${listPathFor(pathname)}${s ? `?${s}` : ""}`);
  };

  const options: { id: string | null; name: string; color?: SpaceColor }[] = [
    { id: null, name: "All Spaces" },
    ...spaces.map((s) => ({ id: s.id, name: s.name, color: s.color })),
  ];

  return (
    <div
      ref={wrap}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (!open || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-left text-[13px] hover:bg-surface-2"
      >
        {current ? <SpaceDot color={current.color} /> : <LayoutGrid className="size-3.5 text-fg-subtle" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-medium">{current?.name ?? "All Spaces"}</span>
        <ChevronsUpDown className="size-3.5 text-fg-subtle" aria-hidden />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Space"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {options.map((o, i) => {
            const selected = (o.id ?? undefined) === current?.id;
            return (
              <button
                key={o.id ?? "all"}
                type="button"
                role="option"
                aria-selected={selected}
                autoFocus={selected || (i === 0 && !current)}
                onClick={() => choose(o.id)}
                className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                {o.color ? <SpaceDot color={o.color} /> : <LayoutGrid className="size-3.5 text-fg-subtle" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {selected && <Check className="size-3.5 text-accent" aria-hidden />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <Link
            href={href("/spaces", {}, current?.id)}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Layers className="size-3.5" aria-hidden /> Manage Spaces
          </Link>
        </div>
      )}
    </div>
  );
}

/** Left navigation. Keeps `?space=` on every link. Also mounts the ⌘K palette. */
export function Sidebar({ spaces, counts }: { spaces: SidebarSpace[]; counts: Record<string, NavCounts> }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const { setMobileOpen } = useShell();
  const spaceId = sp.get("space") ?? undefined;
  const current = spaces.find((s) => s.id === spaceId);
  const c = counts[current?.id ?? "all"] ?? counts.all;

  // close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, sp, setMobileOpen]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Link href={href("/board", { type: "feature" }, current?.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-accent-solid text-accent-fg">
            <LayoutGrid className="size-3.5" aria-hidden />
          </span>
          <span className="text-[14px] font-semibold tracking-tight">Taskhub</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <SpaceSwitcher spaces={spaces} current={current} />
        <button
          type="button"
          onClick={() => openPalette()}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface-2/60 px-2 text-left text-[13px] text-fg-subtle hover:border-border-strong hover:text-fg-muted"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="flex-1">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <ul className="flex flex-col gap-px">
          {NAV_ITEMS.map((item, i) => {
            const Icon = ICONS[item.key];
            const active = pathname === item.path || pathname.startsWith(item.path + "/");
            const countKey = COUNTED[item.key];
            const n = countKey ? c?.[countKey] : undefined;
            const gap = i === 7 || i === 9; // groups: work · insight · admin
            return (
              <li key={item.key} className={cn(gap && "mt-3")}>
                <Link
                  href={href(item.path, "params" in item ? item.params : {}, current?.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                    active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-subtle")} aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {n !== undefined && n > 0 && <span className="text-xs tabular-nums text-fg-subtle">{n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <ThemeToggle />
        <form action="/logout" method="post">
          <button
            type="submit"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-3.5" aria-hidden /> Sign out
          </button>
        </form>
      </div>

      <CommandPalette spaceId={current?.id} spaces={spaces} />
    </div>
  );
}
