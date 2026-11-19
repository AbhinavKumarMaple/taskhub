"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/** Button + popover with checkboxes. Selected values are controlled. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0 ? null : value.length === 1 ? value[0] : `${value.length} selected`;

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-[13px] transition-colors hover:border-border-strong",
          value.length ? "border-accent/60 text-fg" : "border-border text-fg-muted",
        )}
      >
        <span>{label}</span>
        {summary && <span className="max-w-32 truncate font-medium text-fg">{summary}</span>}
        <ChevronDown className="size-3.5 text-fg-subtle" aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-1 min-w-48 rounded-lg border border-border bg-surface p-1.5 shadow-[var(--shadow-pop)]"
        >
          {options.length === 0 && <p className="px-2 py-1.5 text-[13px] text-fg-muted">Nothing to choose</p>}
          {options.map((o) => (
            <Checkbox
              key={o.value}
              label={o.label}
              checked={value.includes(o.value)}
              onChange={() => toggle(o.value)}
              className="flex w-full rounded-md px-2 py-1.5 hover:bg-surface-2"
            />
          ))}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
