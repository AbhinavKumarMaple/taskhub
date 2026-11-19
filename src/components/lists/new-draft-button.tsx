"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NewTaskDialog } from "@/components/task/new-task-dialog";
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
