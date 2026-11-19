"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MenuItem =
  | {
      label: ReactNode;
      onSelect?: () => void;
      /** Renders a link instead of a button. */
      href?: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      /** Right-side hint, e.g. a shortcut. */
      hint?: ReactNode;
    }
  | "separator"
  | { heading: ReactNode };

export type DropdownMenuProps = {
  /** Contents of the trigger button (icon and/or text). */
  trigger: ReactNode;
  /** Accessible name for the trigger. */
  label: string;
  items: MenuItem[];
  align?: "start" | "end";
  triggerClassName?: string;
  menuClassName?: string;
};

/** Button + popup menu. Arrow keys move, Enter selects, Esc / outside click closes. */
export function DropdownMenu({ trigger, label, items, align = "end", triggerClassName, menuClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const first = wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const itemClass = (danger?: boolean, disabled?: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] outline-none",
      danger ? "text-danger focus:bg-danger-soft hover:bg-danger-soft" : "text-fg focus:bg-surface-2 hover:bg-surface-2",
      disabled && "pointer-events-none opacity-50",
      "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-subtle",
    );

  return (
    <div ref={wrap} className="relative inline-flex" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg aria-expanded:bg-surface-2",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1 min-w-44 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-pop)]",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {items.map((it, i) => {
            if (it === "separator") return <div key={i} role="separator" className="my-1 h-px bg-border" />;
            if ("heading" in it)
              return (
                <div key={i} className="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                  {it.heading}
                </div>
              );
            const content = (
              <>
                {it.icon}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-xs text-fg-subtle">{it.hint}</span>}
              </>
            );
            if (it.href)
              return (
                <Link
                  key={i}
                  href={it.href}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={it.disabled || undefined}
                  className={itemClass(it.danger, it.disabled)}
                  onClick={() => {
                    it.onSelect?.();
                    close(false);
                  }}
                >
                  {content}
                </Link>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={it.disabled || undefined}
                className={itemClass(it.danger, it.disabled)}
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
