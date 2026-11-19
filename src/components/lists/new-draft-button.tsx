"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NewTaskDialog, type NewTaskDefaults } from "@/components/task/new-task-dialog";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Opens NewTaskDialog as a draft in the selected Space; on create the dialog opens the new draft's sheet. */
export function NewDraftButton({ variant = "primary" }: { variant?: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  const space = useSearchParams().get("space") ?? undefined;
  return (
    <>
      <Button variant={variant} icon={<Plus className="size-3.5" aria-hidden />} onClick={() => setOpen(true)}>
        New draft
      </Button>
      <NewTaskDialog
        open={open}
        onClose={() => setOpen(false)}
        defaults={{ isDraft: true, spaceId: space }}
        title="New draft"
      />
    </>
  );
}

/** One value from a filter param (first of a comma list), or undefined. */
function first(v: string | null): string | undefined {
  const s = v?.split(",")[0]?.trim();
  return s || undefined;
}

/**
 * "New task": the full create dialog, prefilled from the page's filters (Space, type, priority, label,
 * milestone, status). On create the dialog opens the new task's sheet.
 */
export function NewTaskButton({ variant = "primary", size = "sm" }: { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  const milestone = first(sp.get("milestone"));
  const labels = sp.get("label")?.split(",").map((s) => s.trim()).filter(Boolean);
  const defaults: NewTaskDefaults = {
    isDraft: false,
    spaceId: sp.get("space") ?? undefined,
    type: first(sp.get("type")),
    priority: first(sp.get("priority")),
    status: first(sp.get("status")),
    milestone: milestone && milestone.toLowerCase() !== "none" ? milestone.toUpperCase() : undefined,
    labels: labels?.length ? labels : undefined,
  };
  return (
    <>
      <Button
        size={size}
        variant={variant}
        icon={<Plus className="size-3.5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        New task
      </Button>
      {open && <NewTaskDialog open={open} onClose={() => setOpen(false)} defaults={defaults} />}
    </>
  );
}
