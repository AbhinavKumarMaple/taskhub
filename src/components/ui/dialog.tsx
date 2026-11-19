"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Controlled native <dialog> (top layer, focus trap, Esc). Closing by Esc or backdrop click calls onClose.
 * Shared by Dialog and Sheet.
 */
export function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) onCloseRef.current(); // backdrop
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
      if (d.open) d.close();
    };
  }, []);
  return ref;
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned action row. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const DIALOG_W = { sm: "w-[min(400px,calc(100vw-2rem))]", md: "w-[min(520px,calc(100vw-2rem))]", lg: "w-[min(720px,calc(100vw-2rem))]" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  const ref = useNativeDialog(open, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "m-auto max-h-[calc(100dvh-4rem)] rounded-xl border border-border bg-surface p-0 text-fg shadow-[var(--shadow-pop)]",
        DIALOG_W[size],
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-4rem)] flex-col">
          <div className="flex items-start gap-3 px-5 pt-4 pb-2">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[15px] font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-[13px] text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>}
          {footer && <div className="flex justify-end gap-2 px-5 pt-2 pb-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. */
  danger?: boolean;
  /** Spinner on the confirm button. */
  pending?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  pending,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void onConfirm()} loading={pending} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
