"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = pref;
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") apply("system");
    cb();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as ThemePref);
  const setPref = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {}
    apply(p);
    listeners.forEach((l) => l());
  }, []);
  return { pref, setPref };
}

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Segmented light / system / dark control. */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-md border border-border bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          title={label}
          onClick={() => setPref(value)}
          className={cn(
            "inline-flex h-6 w-7 items-center justify-center rounded-[4px] text-fg-subtle hover:text-fg",
            pref === value && "bg-surface-3 text-fg",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
