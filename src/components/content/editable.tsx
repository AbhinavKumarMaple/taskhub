"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Asks the browser to confirm leaving the page while there are unsaved edits. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * Page title that turns into an input on click (or Enter/Space). Enter or blur saves, Esc cancels.
 * `onSave` resolves to something truthy on success.
 */
export function EditableTitle({
  value,
  onSave,
  disabled,
  label,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const text = "text-xl font-semibold tracking-tight";
  if (editing) {
    return (
      <input
        ref={input}
        aria-label={label}
        value={draft}
        maxLength={200}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          text,
          "-mx-1.5 w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-ring/30",
          className,
        )}
      />
    );
  }
  if (disabled) return <h1 className={cn(text, "py-0.5", className)}>{value}</h1>;
  return (
    <h1 className={cn(text, className)}>
      <button
        type="button"
        title="Rename"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="group -mx-1.5 inline-flex max-w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-0.5 text-left hover:border-border"
      >
        <span className="min-w-0 break-words">{value}</span>
        <Pencil className="touch-reveal size-3.5 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </button>
    </h1>
  );
}
