"use client";

import { ExternalLink, Pencil, Plus, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { LabelChip } from "@/components/ui/chip";
import { fieldClass, Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { cn } from "@/lib/cn";
import { Section } from "./section";

/** Heading-sized title input: saves on Enter or blur, Esc reverts. */
export function InlineTitle({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const commit = () => {
    const t = text.trim();
    if (!t) setText(value);
    else if (t !== value) onSave(t);
  };
  return (
    <textarea
      value={text}
      rows={1}
      disabled={disabled}
      aria-label="Title"
      onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur());
        }
      }}
      className="field-sizing-content -mx-1.5 block w-[calc(100%+0.75rem)] resize-none rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-lg font-semibold leading-snug text-fg hover:border-border focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-100"
    />
  );
}

/** Chips + input. Enter or comma adds, Backspace on empty removes the last. */
export function TagInput({
  values,
  onChange,
  suggestions = [],
  placeholder = "Add…",
  label,
  id,
  renderChip,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label: string;
  id?: string;
  renderChip?: (v: string) => ReactNode;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "").trim();
    setText("");
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  const left = suggestions.filter((s) => !values.includes(s));
  return (
    <div className={cn(fieldClass, "flex min-h-8 flex-wrap items-center gap-1 px-1.5 py-1 focus-within:border-accent")}>
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-0.5">
          {renderChip ? renderChip(v) : <LabelChip label={v} size="sm" />}
          <button
            type="button"
            onClick={() => remove(v)}
            aria-label={`Remove ${v}`}
            className="inline-flex size-4 items-center justify-center rounded text-fg-subtle hover:bg-surface-3 hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        list={left.length ? listId : undefined}
        aria-label={label}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v);
          else if (left.includes(v)) add(v);
          else setText(v);
        }}
        onBlur={() => text.trim() && add(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) {
            remove(values[values.length - 1]);
          }
        }}
        className="h-6 min-w-16 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-fg-subtle"
      />
      {left.length > 0 && (
        <datalist id={listId}>
          {left.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** References / documentation / modified files: list with add and remove. */
export function StringList({
  title,
  values,
  onChange,
  emptyText,
  placeholder,
  mono,
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  emptyText: string;
  placeholder: string;
  mono?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const submit = () => {
    const add = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !values.includes(s));
    setText("");
    if (add.length) onChange([...values, ...add]);
  };
  return (
    <Section
      title={title}
      meta={values.length || undefined}
      actions={
        !adding && (
          <IconButton label={`Add to ${title.toLowerCase()}`} size="xs" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
          </IconButton>
        )
      }
    >
      {values.length === 0 && !adding && <p className="text-[13px] text-fg-subtle">{emptyText}</p>}
      {values.length > 0 && (
        <ul className="flex flex-col">
          {values.map((v) => (
            <li key={v} className="group flex items-center gap-1.5 rounded-md py-0.5 pr-0.5 hover:bg-surface-2">
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", mono && "font-mono text-[12px]")} title={v}>
                {isUrl(v) ? (
                  <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    <span className="truncate">{v.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  v
                )}
              </span>
              <IconButton
                label={`Remove ${v}`}
                size="xs"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="size-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form
          className="mt-1.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            inputSize="sm"
            className="flex-1"
            value={text}
            placeholder={placeholder}
            aria-label={`Add to ${title.toLowerCase()}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setAdding(false);
                setText("");
              }
            }}
          />
          <Button type="submit" size="sm" variant="primary" disabled={!text.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setAdding(false), setText(""))}>
            Done
          </Button>
        </form>
      )}
    </Section>
  );
}

/** Markdown section: rendered view, Edit opens Write/Preview with Save (⌘Enter) and Cancel. */
export function MarkdownField({
  title,
  value,
  onSave,
  emptyText,
  rows = 8,
}: {
  title: string;
  value: string;
  onSave: (v: string) => void;
  emptyText: string;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const start = () => {
    setText(value);
    setEditing(true);
  };
  const save = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };
  return (
    <Section
      title={title}
      actions={
        !editing && (
          <IconButton label={`Edit ${title.toLowerCase()}`} size="xs" onClick={start}>
            <Pencil className="size-3" />
          </IconButton>
        )
      }
    >
      {editing ? (
        <div
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}
        >
          <MarkdownEditor value={text} onChange={setText} rows={rows} autoFocus onSubmit={save} aria-label={title} />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-fg-subtle">⌘Enter to save · Esc to cancel</span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : value.trim() ? (
        <div className="cursor-text rounded-md" onDoubleClick={start}>
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-md border border-dashed border-border px-3 py-2.5 text-left text-[13px] text-fg-subtle hover:border-border-strong hover:text-fg-muted"
        >
          {emptyText}
        </button>
      )}
    </Section>
  );
}
