import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Still block that breathes (animate-pulse), never a moving shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** Says what to do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 text-fg-subtle [&_svg]:size-6">{icon}</div>}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-border bg-surface-2 px-1 font-sans text-[11px] font-medium text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Hover/focus tooltip (CSS only). Wrap an interactive element. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const pos = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
    left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
    right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  }[side];
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] font-medium text-bg opacity-0 transition-opacity delay-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          pos,
        )}
      >
        {content}
      </span>
    </span>
  );
}

/** Small circular progress (e.g. AC n/m on cards). */
export function ProgressRing({
  value,
  max,
  size = 14,
  stroke = 2,
  className,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  className?: string;
  /** Accessible label; default "value of max". */
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const complete = max > 0 && value >= max;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${value} of ${max}`}
      className={cn("shrink-0 -rotate-90", className)}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className={complete ? "stroke-done" : "stroke-accent"}
      />
    </svg>
  );
}

export function ProgressBar({
  value,
  max,
  className,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  className?: string;
  /** "auto" = green when complete. */
  tone?: "accent" | "done" | "waiting" | "auto";
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const t = tone === "auto" ? (max > 0 && value >= max ? "done" : "accent") : tone;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", t === "done" ? "bg-done" : t === "waiting" ? "bg-waiting" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Page header: title, optional description, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 pb-4", className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
