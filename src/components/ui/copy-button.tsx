"use client";

import { Check, Copy, Link2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

/** Copies `value`; icon-only unless `children`/`label` text is given. */
export function CopyButton({
  value,
  label = "Copy",
  children,
  variant = "ghost",
  size = "sm",
  className,
  onCopied,
  icon = "copy",
}: {
  value: string | (() => string);
  /** Accessible name + tooltip. */
  label?: string;
  /** Visible text next to the icon. */
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  onCopied?: () => void;
  /** "link" for copying a URL, so it is not confused with copying a ref. */
  icon?: "copy" | "link";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = typeof value === "function" ? value() : value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1500);
  };
  const Icon: LucideIcon = copied ? Check : icon === "link" ? Link2 : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={children ? undefined : label}
      title={label}
      className={buttonClass(variant, size, className, !children)}
    >
      <Icon className={cn("size-3.5", copied && "text-done")} aria-hidden />
      {children}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
