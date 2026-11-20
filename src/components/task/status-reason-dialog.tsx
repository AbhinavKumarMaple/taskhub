"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";

export type ReasonRequest = {
  ref: string;
  title: string;
  from: string;
  to: string;
  /** Prefill (e.g. the current reason when editing it). */
  initial?: string;
};

const PROMPT: Record<string, { title: (ref: string) => string; hint: string; placeholder: string }> = {
  blocked: {
    title: (ref) => `What is blocking ${ref}?`,
    hint: "Say what it waits for and who can unblock it. This shows on the card until it moves on.",
    placeholder: "Waiting on: an API key from the vendor (promised Friday)",
  },
  cancelled: {
    title: (ref) => `Why is ${ref} cancelled?`,
    hint: "A line for the history: dropped, duplicate, replaced by another task…",
    placeholder: "Replaced by T-40, which covers both screens",
  },
};

function promptFor(status: string) {
  const s = status.toLowerCase();
  if (/cancel|drop|won'?t|abandon/.test(s)) return PROMPT.cancelled;
  if (/block|hold|stuck|paus/.test(s)) return PROMPT.blocked;
  return {
    title: (ref: string) => `Why is ${ref} moving to ${status}?`,
    hint: `"${status}" needs a reason. It is kept in the task's status history.`,
    placeholder: "Reason",
  };
}

/** Asks why a task is moving into a status that needs a reason. Resolves with the text, or cancels. */
export function StatusReasonDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: ReasonRequest | null;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  // New request → start from its prefill (state adjusted during render, not in an effect).
  const [shown, setShown] = useState<ReasonRequest | null>(null);
  if (request !== shown) {
    setShown(request);
    if (request) setText(request.initial ?? "");
  }
  const p = promptFor(request?.to ?? "");
  const editing = !!request && request.from === request.to;
  const valid = text.trim().length > 0 && (!editing || text.trim() !== (request?.initial ?? "").trim());

  const submit = async () => {
    if (!valid || pending) return;
    setPending(true);
    try {
      await onConfirm(text.trim());
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={!!request}
      onClose={onCancel}
      size="sm"
      title={request ? p.title(request.ref) : ""}
      description={request ? (editing ? `${request.title} · stays in ${request.to}` : `${request.title} · ${request.from} → ${request.to}`) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {editing ? "Cancel" : `Keep in ${request?.from}`}
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={pending} disabled={!valid}>
            {editing ? "Save reason" : `Move to ${request?.to}`}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Reason" htmlFor={`${id}-reason`} hint={p.hint}>
          <Textarea
            id={`${id}-reason`}
            autoFocus
            rows={3}
            maxLength={5000}
            placeholder={p.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>
      </form>
    </Dialog>
  );
}
