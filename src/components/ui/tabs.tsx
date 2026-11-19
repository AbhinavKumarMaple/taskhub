"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { value: string; label: ReactNode; count?: number; disabled?: boolean };

const tabClass = (active: boolean) =>
  cn(
    "relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-1 text-[13px] font-medium transition-colors",
    active ? "text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg",
  );

const Count = ({ n }: { n?: number }) =>
  n === undefined ? null : <span className="rounded-full bg-surface-2 px-1.5 text-[11px] leading-4 text-fg-muted tabular-nums">{n}</span>;

/** Controlled tab bar (roving focus with arrow keys). Render the panel yourself. */
export function Tabs({
  tabs,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const enabled = tabs.filter((t) => !t.disabled);
    const i = enabled.findIndex((t) => t.value === value);
    const next = enabled[(i + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      list.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
    }
  };
  return (
    <div ref={list} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cn("flex items-center gap-4 border-b border-border", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          data-value={t.value}
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          disabled={t.disabled}
          onClick={() => onChange(t.value)}
          className={tabClass(t.value === value)}
        >
          {t.label}
          <Count n={t.count} />
        </button>
      ))}
    </div>
  );
}

/** Tab bar whose tabs are links (URL-driven tabs, e.g. ?tab=docs). */
export function TabLinks({
  tabs,
  className,
}: {
  tabs: { href: string; label: ReactNode; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav className={cn("flex items-center gap-4 border-b border-border", className)}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={tabClass(t.active)} scroll={false}>
          {t.label}
          <Count n={t.count} />
        </Link>
      ))}
    </nav>
  );
}
