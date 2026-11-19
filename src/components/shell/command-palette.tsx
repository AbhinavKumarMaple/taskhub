"use client";

import { CornerDownLeft, FileText, Loader2, Scale, Search, SquareCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchAction } from "@/app/actions/search";
import { useNativeDialog } from "@/components/ui/dialog";
import { SpaceDot, StatusChip, TypeChip } from "@/components/ui/chip";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { decisionHref, documentHref, href, NAV_ITEMS, taskHref } from "@/lib/nav";
import type { SearchResult, SpaceColor } from "@/lib/types";

const OPEN_EVENT = "taskhub:palette";

/** Open the ⌘K palette from anywhere (optionally with a starting query). */
export function openPalette(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { query } }));
}

type Row =
  | { kind: "nav"; id: string; label: string; href: string }
  | { kind: "result"; id: string; result: SearchResult; href: string };

const KIND_ICON = { task: SquareCheck, document: FileText, decision: Scale } as const;

export function CommandPalette({ spaceId, spaces }: { spaceId?: string; spaces: { id: string; name: string; color: SpaceColor }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [allSpaces, setAllSpaces] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const close = () => setOpen(false);
  const dialogRef = useNativeDialog(open, close);
  const scope = allSpaces ? undefined : spaceId;
  const scopeName = spaces.find((s) => s.id === spaceId)?.name;

  // ⌘K / Ctrl+K and the open event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      const query = (e as CustomEvent<{ query?: string }>).detail?.query;
      if (query !== undefined) setQ(query);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // debounced search
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const id = ++reqId.current;
    if (!query) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchAction(query, { space: scope }).catch(() => null);
      if (id !== reqId.current) return;
      setLoading(false);
      if (!r) setError("Search failed");
      else if (!r.ok) setError(r.error);
      else {
        setError(null);
        setResults(r.data);
      }
      setActive(0);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open, scope]);

  const ql = q.trim().toLowerCase();
  const navRows: Row[] = NAV_ITEMS.filter((n) => !ql || n.label.toLowerCase().includes(ql)).map((n) => ({
    kind: "nav",
    id: `nav-${n.key}`,
    label: `Go to ${n.label}`,
    href: href(n.path, "params" in n ? n.params : {}, spaceId),
  }));
  const shown = ql ? results : [];
  const resultRows: Row[] = shown.map((r) => ({
    kind: "result",
    id: `${r.kind}-${r.ref}`,
    result: r,
    href:
      r.kind === "task" ? taskHref(r.ref, spaceId) : r.kind === "document" ? documentHref(r.ref, spaceId) : decisionHref(r.ref, spaceId),
  }));
  const rows = ql ? [...resultRows, ...navRows.slice(0, 4)] : navRows;
  const safeActive = Math.min(active, Math.max(rows.length - 1, 0));

  const go = (row: Row | undefined) => {
    if (!row) return;
    close();
    setQ("");
    router.push(row.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((safeActive + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((safeActive - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(rows[safeActive]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search"
      className="mx-auto mt-[12vh] mb-auto w-[min(640px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-fg shadow-[var(--shadow-pop)]"
    >
      {open && (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            {loading ? (
              <Loader2 className="size-4 animate-spin text-fg-subtle" aria-hidden />
            ) : (
              <Search className="size-4 text-fg-subtle" aria-hidden />
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder="Search tasks, documents, decisions… or jump to a page"
              aria-label="Search"
              aria-controls="palette-list"
              aria-activedescendant={rows[safeActive] ? `palette-${rows[safeActive].id}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle"
            />
            {spaceId && (
              <button
                type="button"
                onClick={() => setAllSpaces((a) => !a)}
                className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-fg-muted hover:bg-surface-2"
                title="Toggle search scope"
              >
                {allSpaces ? "All Spaces" : scopeName}
              </button>
            )}
          </div>
          <div id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
            {error && ql && <p className="px-3 py-6 text-center text-[13px] text-danger">{error}</p>}
            {!error && ql && !loading && shown.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-fg-muted">
                No matches for “{q.trim()}”. Every word must appear; try fewer words.
              </p>
            )}
            {rows.map((row, i) => {
              const selected = i === safeActive;
              const common = {
                id: `palette-${row.id}`,
                role: "option" as const,
                "aria-selected": selected,
                "data-index": i,
                onMouseMove: () => setActive(i),
                onClick: () => go(row),
                className: cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]",
                  selected ? "bg-surface-2" : "",
                ),
              };
              if (row.kind === "nav")
                return (
                  <div key={row.id} {...common}>
                    <CornerDownLeft className="size-3.5 text-fg-subtle" aria-hidden />
                    <span className="flex-1 text-fg-muted">{row.label}</span>
                  </div>
                );
              const r = row.result;
              const Icon = KIND_ICON[r.kind];
              return (
                <div key={row.id} {...common}>
                  <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-xs text-fg-subtle">{r.ref}</span>
                      <span className="truncate font-medium">{r.title}</span>
                    </div>
                    {r.snippet && <p className="truncate text-xs text-fg-subtle">{r.snippet}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.kind === "task" && r.type && <TypeChip type={r.type} />}
                    {r.status && <StatusChip status={r.status} size="xs" />}
                    {!spaceId || allSpaces ? (
                      <span className="flex items-center gap-1 text-xs text-fg-subtle">
                        <SpaceDot color={r.space.color} className="size-1.5" />
                        {r.space.name}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      )}
    </dialog>
  );
}
