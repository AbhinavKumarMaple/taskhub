import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A titled block in the task detail. */
export function Section({
  title,
  meta,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  /** Small text after the title, e.g. "3 of 5 complete". */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={id}>
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <h3 id={id} className="text-[13px] font-semibold text-fg">
          {title}
        </h3>
        {meta && <span className="text-xs text-fg-subtle">{meta}</span>}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Label + value row in the properties list. */
export function PropRow({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid min-h-8 grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={htmlFor} className="text-xs text-fg-muted">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
