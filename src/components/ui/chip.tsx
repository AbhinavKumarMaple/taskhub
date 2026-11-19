import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SpaceColor, SpaceRef } from "@/lib/types";

export type ChipTone = "neutral" | "accent" | "todo" | "progress" | "done" | "waiting" | "danger" | "outline";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-transparent",
  outline: "bg-transparent text-fg-muted border-border",
  accent: "bg-accent-soft text-accent-soft-fg border-transparent",
  todo: "bg-todo-soft text-todo-fg border-transparent",
  progress: "bg-progress-soft text-progress-fg border-transparent",
  done: "bg-done-soft text-done-fg border-transparent",
  waiting: "bg-waiting-soft text-waiting-fg border-transparent",
  danger: "bg-danger-soft text-danger-soft-fg border-transparent",
};

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  size?: "xs" | "sm";
  /** Small leading dot in the tone colour (or pass `dotClassName`). */
  dot?: boolean;
  dotClassName?: string;
  icon?: ReactNode;
};

/** Small pill. Alias: Badge. */
export function Chip({ tone = "neutral", size = "sm", dot, dotClassName, icon, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-none",
        size === "xs" ? "h-[18px] px-1.5 text-[11px]" : "h-5 px-2 text-xs",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full bg-current", dotClassName)} aria-hidden />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
export const Badge = Chip;

/**
 * Tone for a status: the first configured status is "todo", the last is "done", anything between is
 * "progress". Without `statuses`, uses the defaults' names.
 */
export function statusTone(status: string, statuses?: string[]): ChipTone {
  if (statuses?.length) {
    if (status === statuses[statuses.length - 1]) return "done";
    if (status === statuses[0]) return "todo";
    return statuses.includes(status) ? "progress" : "neutral";
  }
  const s = status.toLowerCase();
  if (s === "done") return "done";
  if (s === "to do" || s === "todo") return "todo";
  return "progress";
}

export function StatusChip({ status, statuses, size, className }: { status: string; statuses?: string[]; size?: "xs" | "sm"; className?: string }) {
  return (
    <Chip tone={statusTone(status, statuses)} dot size={size} className={className}>
      {status}
    </Chip>
  );
}

export function TypeChip({ type, size = "xs", className }: { type: string; size?: "xs" | "sm"; className?: string }) {
  return (
    <Chip tone={type === "fix" ? "danger" : "outline"} size={size} className={cn("font-normal", className)}>
      {type}
    </Chip>
  );
}

/** Label pill; `waiting` is amber. */
export function LabelChip({ label, size = "xs", className }: { label: string; size?: "xs" | "sm"; className?: string }) {
  return (
    <Chip tone={label === "waiting" ? "waiting" : "neutral"} size={size} className={className}>
      {label}
    </Chip>
  );
}

export const SWATCH_CLASS: Record<SpaceColor, string> = {
  gray: "bg-sw-gray",
  blue: "bg-sw-blue",
  green: "bg-sw-green",
  amber: "bg-sw-amber",
  red: "bg-sw-red",
  purple: "bg-sw-purple",
  pink: "bg-sw-pink",
  teal: "bg-sw-teal",
};

export function SpaceDot({ color, className }: { color: SpaceColor | string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", SWATCH_CLASS[color as SpaceColor] ?? "bg-sw-gray", className)}
      aria-hidden
    />
  );
}

export function SpaceChip({ space, size = "xs", className }: { space: Pick<SpaceRef, "name" | "color">; size?: "xs" | "sm"; className?: string }) {
  return (
    <Chip tone="outline" size={size} className={cn("font-normal", className)} icon={<SpaceDot color={space.color} className="size-1.5" />}>
      {space.name}
    </Chip>
  );
}

const PRIORITY_BARS: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Three little bars; filled by priority (High 3, Medium 2, Low 1). Unknown priorities show the name. */
export function PriorityMarker({ priority, className }: { priority: string | null | undefined; className?: string }) {
  if (!priority) return null;
  const n = PRIORITY_BARS[priority.toLowerCase()];
  if (!n) return <Chip size="xs" tone="outline">{priority}</Chip>;
  return (
    <span className={cn("inline-flex h-3 items-end gap-[2px]", className)} title={`${priority} priority`} aria-label={`${priority} priority`} role="img">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px]",
            i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3",
            i <= n ? (n === 3 ? "bg-danger" : n === 2 ? "bg-waiting" : "bg-fg-subtle") : "bg-surface-3",
          )}
        />
      ))}
    </span>
  );
}
