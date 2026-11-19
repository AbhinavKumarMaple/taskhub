"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";

/** Which text boxes inside one task view hold typing that is not saved yet. */
export type UnsavedRegistry = { dirty: Set<string> };

const UnsavedContext = createContext<UnsavedRegistry | null>(null);

/** A registry for one task view; pass it to <UnsavedProvider> and check it with confirmDiscard() on close. */
export function useUnsavedRegistry(): UnsavedRegistry {
  const [reg] = useState<UnsavedRegistry>(() => ({ dirty: new Set() }));
  return reg;
}

export function UnsavedProvider({ registry, children }: { registry: UnsavedRegistry; children: ReactNode }) {
  return <UnsavedContext.Provider value={registry}>{children}</UnsavedContext.Provider>;
}

/** Report whether this text box has unsaved typing. No-op outside a provider. */
export function useUnsaved(dirty: boolean) {
  const reg = useContext(UnsavedContext);
  const id = useId();
  useEffect(() => {
    if (!reg) return;
    if (dirty) reg.dirty.add(id);
    else reg.dirty.delete(id);
    return () => {
      reg.dirty.delete(id);
    };
  }, [reg, dirty, id]);
}

/** True when nothing is unsaved, or the person agrees to throw the typing away. */
export function confirmDiscard(reg: UnsavedRegistry, what = "this task"): boolean {
  if (reg.dirty.size === 0) return true;
  return window.confirm(`Discard unsaved text?\n\nYou have typing in ${what} that is not saved yet.`);
}
