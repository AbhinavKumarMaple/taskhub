"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { progressText } from "@/lib/format";
import type { ChecklistItem } from "@/lib/types";
import { Section } from "./section";
import { useUnsaved } from "./unsaved";

export type ChecklistHandlers = {
  /** 1-based index. */
  onToggle: (index: number, checked: boolean) => void;
  onAdd: (text: string) => void;
  onEdit: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  /** New order as 1-based indexes of the current list. */
  onReorder: (order: number[]) => void;
};

/** AC / DoD checklist: check, add, inline edit, drag (or keyboard) reorder, delete. */
export function Checklist({
  title,
  items,
  emptyText,
  addLabel = "Add item",
  disabled,
  ...h
}: ChecklistHandlers & {
  title: string;
  items: ChecklistItem[];
  emptyText: string;
  addLabel?: string;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  useUnsaved(adding && !!draft.trim());
  const done = items.filter((i) => i.checked).length;
  const dndId = useId(); // stable id so server and client markup match
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(Number(e.active.id));
    const to = ids.indexOf(Number(e.over.id));
    if (from < 0 || to < 0) return;
    const order = arrayMove(
      items.map((_, i) => i + 1),
      from,
      to,
    );
    h.onReorder(order);
  };

  const submit = () => {
    const lines = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return;
    lines.forEach((l) => h.onAdd(l));
    setDraft("");
  };

  return (
    <Section
      title={title}
      meta={items.length ? progressText(done, items.length) : undefined}
      actions={
        !disabled &&
        !adding && (
          <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
            {addLabel}
          </Button>
        )
      }
    >
      {items.length > 0 && <ProgressBar value={done} max={items.length} tone="auto" />}
      {items.length === 0 && !adding && <p className="text-[13px] text-fg-subtle">{emptyText}</p>}
      {items.length > 0 && (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="mt-2 flex flex-col">
              {items.map((it, i) => (
                <Row key={it.id} item={it} index={i + 1} disabled={disabled} {...h} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {adding && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            inputSize="sm"
            className="flex-1"
            value={draft}
            aria-label={`New ${title.toLowerCase()} item`}
            placeholder="Describe the item, then press Enter"
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text.includes("\n")) {
                e.preventDefault();
                setDraft(text);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <Button type="submit" size="sm" variant="primary" disabled={!draft.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            Done
          </Button>
        </form>
      )}
    </Section>
  );
}

function Row({
  item,
  index,
  disabled,
  onToggle,
  onEdit,
  onRemove,
}: { item: ChecklistItem; index: number; disabled?: boolean } & ChecklistHandlers) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  const commit = () => {
    const t = text.trim();
    setEditing(false);
    if (t && t !== item.text) onEdit(index, t);
    else setText(item.text);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-start gap-1.5 rounded-md py-1 pr-1 hover:bg-surface-2",
        isDragging && "relative z-10 bg-surface-2 shadow-[var(--shadow-pop)]",
      )}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder item ${index}: ${item.text}`}
          className="touch-reveal mt-[1px] inline-flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      {editing ? (
        <Input
          autoFocus
          inputSize="sm"
          className="flex-1"
          value={text}
          aria-label={`Edit item ${index}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setText(item.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          <Checkbox
            checked={item.checked}
            disabled={disabled}
            onChange={(e) => onToggle(index, e.target.checked)}
            className="min-w-0 flex-1"
            label={
              <span
                className={cn("break-words", item.checked && "text-fg-subtle line-through")}
                onDoubleClick={(e) => {
                  if (disabled) return;
                  e.preventDefault();
                  setText(item.text);
                  setEditing(true);
                }}
              >
                {item.text}
              </span>
            }
          />
          {!disabled && (
            <span className="touch-reveal flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton
                label={`Edit item ${index}`}
                size="xs"
                onClick={() => {
                  setText(item.text);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3" />
              </IconButton>
              <IconButton label={`Delete item ${index}`} size="xs" onClick={() => onRemove(index)}>
                <Trash2 className="size-3" />
              </IconButton>
            </span>
          )}
        </>
      )}
    </li>
  );
}
