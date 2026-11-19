"use client";

import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useNativeDialog } from "./dialog";

export type SheetProps = {
  /** Controlled. For URL-driven sheets pass `open={!!searchParams.get("task")}` and remove the param in onClose. */
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small line under the title (e.g. ref + chips). */
  subtitle?: ReactNode;
  /** Buttons at the right of the header, before the close button. */
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** CSS width, default min(720px, 100vw). */
  width?: string;
  className?: string;
};

/** Right-hand panel on a native <dialog> (focus trap, Esc and backdrop close). */
export function Sheet({ open, onClose, title, subtitle, actions, children, footer, width, className }: SheetProps) {
  const ref = useNativeDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      style={{ width: width ?? "min(720px, 100vw)" }}
      className={cn(
        "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh max-w-[100vw] border-0 border-l border-border bg-surface p-0 text-fg shadow-[var(--shadow-pop)]",
        className,
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-[15px] font-semibold leading-7">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">{subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
