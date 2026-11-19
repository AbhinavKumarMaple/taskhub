import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "xs" | "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong",
  outline: "bg-transparent text-fg border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-fg-muted border border-transparent hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger-hover border border-transparent",
};
const SIZES: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-xs gap-1 rounded-[5px]",
  sm: "h-7 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
};

/** Class string for a button look — use on <Link> / <a> too. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon before the label (a lucide icon element). */
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  children: ReactNode;
  variant?: Exclude<ButtonVariant, "primary"> | "primary";
  size?: ButtonSize;
};

const ICON_SIZES: Record<ButtonSize, string> = { xs: "size-6", sm: "size-7", md: "size-8" };

/** Square icon-only button with an aria-label + title. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, variant = "ghost", size = "sm", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(buttonClass(variant, size), ICON_SIZES[size], "px-0", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
