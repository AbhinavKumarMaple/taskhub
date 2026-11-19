"use client";

import { Check, ChevronDown, Minus } from "lucide-react";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const fieldClass = cn(
  "w-full rounded-md border border-border bg-surface text-[13px] text-fg placeholder:text-fg-subtle",
  "transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger",
);

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Icon shown inside the field on the left. */
  icon?: ReactNode;
  inputSize?: "sm" | "md";
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, inputSize = "md", ...rest },
  ref,
) {
  const h = inputSize === "sm" ? "h-7" : "h-8";
  if (!icon) return <input ref={ref} className={cn(fieldClass, h, "px-2.5", className)} {...rest} />;
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-fg-subtle [&_svg]:size-3.5">
        {icon}
      </span>
      <input ref={ref} className={cn(fieldClass, h, "pl-8 pr-2.5")} {...rest} />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(fieldClass, "min-h-16 resize-y px-2.5 py-2 leading-relaxed", className)}
        {...rest}
      />
    );
  },
);

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  options?: SelectOption[];
  /** Adds a first empty option with this label. */
  placeholder?: string;
  children?: ReactNode;
  selectSize?: "sm" | "md";
};

/** Native select, styled. Pass `options` or <option> children. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, placeholder, children, selectSize = "md", ...rest },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className={cn(fieldClass, selectSize === "sm" ? "h-7" : "h-8", "appearance-none pl-2.5 pr-7")}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  /** Shows a dash (mixed state). */
  indeterminate?: boolean;
};

/** Accessible checkbox (native input, custom box). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, indeterminate, id, ...rest },
  ref,
) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn("inline-flex items-start gap-2 text-[13px]", rest.disabled ? "opacity-60" : "cursor-pointer", className)}>
      <span className="relative mt-[2px] inline-flex size-4 shrink-0">
        <input
          ref={ref}
          id={cid}
          type="checkbox"
          aria-checked={indeterminate ? "mixed" : undefined}
          className="peer size-4 cursor-pointer appearance-none rounded-[4px] border border-border-strong bg-surface transition-colors checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
          {...rest}
        />
        {indeterminate ? (
          <Minus className="pointer-events-none absolute inset-0 m-auto size-3 text-fg-muted" aria-hidden />
        ) : (
          <Check
            className="pointer-events-none absolute inset-0 m-auto size-3 text-accent-fg opacity-0 peer-checked:opacity-100"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
      {label !== undefined && <span className="min-w-0">{label}</span>}
    </label>
  );
});

/** Label + control + hint/error. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
