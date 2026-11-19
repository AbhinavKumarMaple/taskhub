"use client";

import { Menu } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ShellCtx = { mobileOpen: boolean; setMobileOpen: (o: boolean) => void };
const Ctx = createContext<ShellCtx>({ mobileOpen: false, setMobileOpen: () => {} });
export const useShell = () => useContext(Ctx);

/**
 * Frame: sidebar (fixed 232px at ≥1024px, overlay drawer below) + scrolling main area.
 * Pages render inside <main> with 24px padding; full-bleed pages (board) can use `-m-6`.
 */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <Ctx value={{ mobileOpen, setMobileOpen }}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        {mobileOpen && (
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" aria-hidden onClick={() => setMobileOpen(false)} />
        )}
        <aside
          className={cn(
            "z-50 flex w-[232px] shrink-0 flex-col border-r border-border bg-surface",
            "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:transition-transform max-lg:duration-200",
            mobileOpen ? "max-lg:translate-x-0 max-lg:shadow-[var(--shadow-pop)]" : "max-lg:-translate-x-full",
          )}
          aria-label="Sidebar"
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <Menu className="size-4" />
            </button>
            <span className="text-[13px] font-semibold">Taskhub</span>
          </div>
          <main id="main" className="min-h-0 flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </Ctx>
  );
}
