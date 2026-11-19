"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "default" | "success" | "error";
export type ToastInput = { title: ReactNode; description?: ReactNode; tone?: ToastTone; durationMs?: number };
type ToastItem = ToastInput & { id: number };

type Ctx = {
  toast: (t: ToastInput | string) => void;
  success: (title: ReactNode, description?: ReactNode) => void;
  error: (title: ReactNode, description?: ReactNode) => void;
};
const ToastContext = createContext<Ctx | null>(null);

/** Mounted once in the root layout. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: ToastInput | string) => {
      const input = typeof t === "string" ? { title: t } : t;
      const id = next.current++;
      setItems((xs) => [...xs.slice(-3), { ...input, id }]);
      setTimeout(() => dismiss(id), input.durationMs ?? (input.tone === "error" ? 7000 : 4000));
    },
    [dismiss],
  );
  const value = useMemo<Ctx>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
    }),
    [toast],
  );
  return (
    <ToastContext value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : Info;
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-pop)]"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  t.tone === "success" ? "text-done" : t.tone === "error" ? "text-danger" : "text-fg-subtle",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-fg-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-mr-1 inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

/** `const { toast, success, error } = useToast()`. */
export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
