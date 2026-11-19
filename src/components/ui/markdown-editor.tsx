"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Textarea } from "./input";
import { Markdown } from "./markdown";

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** For plain <form> posts. */
  name?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  /** Start on the preview tab. */
  defaultTab?: "edit" | "preview";
  /** ⌘/Ctrl+Enter. */
  onSubmit?: () => void;
  "aria-label"?: string;
};

/** Textarea with Write / Preview tabs. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Markdown supported",
  rows = 8,
  name,
  id,
  autoFocus,
  className,
  defaultTab = "edit",
  onSubmit,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"edit" | "preview">(defaultTab);
  return (
    <div className={cn("rounded-md border border-border bg-surface focus-within:border-accent", className)}>
      <div role="tablist" className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-6 rounded px-2 text-xs font-medium",
              tab === t ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {t === "edit" ? "Write" : "Preview"}
          </button>
        ))}
        <span className="ml-auto pr-1 text-[11px] text-fg-subtle">Markdown</span>
      </div>
      {tab === "edit" ? (
        <Textarea
          id={id}
          name={name}
          value={value}
          rows={rows}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="rounded-none border-0 bg-transparent font-mono text-[12.5px] focus:ring-0"
        />
      ) : (
        <div className="min-h-24 px-3 py-2.5" style={{ minHeight: `${rows * 1.5}rem` }}>
          <Markdown empty="Nothing to preview">{value}</Markdown>
          {name && <input type="hidden" name={name} value={value} />}
        </div>
      )}
    </div>
  );
}
