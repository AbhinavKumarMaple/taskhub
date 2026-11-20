"use client";

import { ImagePlus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog, useNativeDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Attachment } from "@/lib/types";
import { Section } from "./section";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_SIDE = 2400;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Keeps screenshots small: anything wider/taller than 2400 px or over ~1.5 MB is redrawn as WebP
 * (JPEG if the browser cannot encode WebP). GIFs are sent as they are (animation).
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const [type, q] of [["image/webp", 0.86], ["image/jpeg", 0.85], ["image/webp", 0.7], ["image/jpeg", 0.65]] as const) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    if (blob && blob.type === type && blob.size <= MAX_BYTES) return blob;
  }
  return file;
}

const imageFiles = (list: FileList | File[] | null | undefined) => Array.from(list ?? []).filter((f) => TYPES.includes(f.type));

function isEditable(el: EventTarget | null) {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT");
}

/**
 * Screenshots on a task. Add by pasting anywhere on the task (outside a text box), dropping a file on the
 * section, or picking one. Only when a picture explains something better than words.
 */
export function Attachments({
  taskRef,
  items,
  onChanged,
}: {
  taskRef: string;
  items: Attachment[];
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<Attachment | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading((n) => n + files.length);
      for (const f of files) {
        try {
          const blob = await shrinkImage(f);
          if (blob.size > MAX_BYTES) {
            toast.error(`${f.name || "Image"} is too large`, "The limit is 3 MB. Crop it and try again.");
            continue;
          }
          const form = new FormData();
          const ext = blob.type.split("/")[1] === "jpeg" ? "jpg" : blob.type.split("/")[1];
          const base = (f.name || "screenshot").replace(/\.[a-z0-9]+$/i, "");
          form.set("file", blob, `${base}.${ext}`);
          const res = await fetch(`/api/v1/tasks/${taskRef}/attachments`, { method: "POST", body: form });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            toast.error("Couldn't attach the image", body?.error?.message ?? `HTTP ${res.status}`);
          }
        } catch {
          toast.error("Couldn't attach the image", "The server did not respond.");
        } finally {
          setUploading((n) => n - 1);
        }
      }
      await onChanged();
    },
    [taskRef, toast, onChanged],
  );

  // Paste an image anywhere on the page while this task is open (not inside a text field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      void upload(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [upload]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void upload(imageFiles(e.dataTransfer.files));
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const res = await fetch(`/api/v1/tasks/${taskRef}/attachments/${removing.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) toast.error("Couldn't remove the image");
    setRemoving(null);
    setOpen(null);
    await onChanged();
  };

  const saveCaption = async (a: Attachment, caption: string) => {
    if (caption === a.caption) return;
    const res = await fetch(`/api/v1/tasks/${taskRef}/attachments/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caption }),
    }).catch(() => null);
    if (!res?.ok) toast.error("Couldn't save the caption");
    await onChanged();
  };

  return (
    <Section
      title="Screenshots"
      meta={items.length ? String(items.length) : undefined}
      actions={
        <Button size="xs" variant="ghost" icon={<ImagePlus className="size-3.5" />} onClick={() => fileRef.current?.click()} loading={uploading > 0}>
          Add
        </Button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept={TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          void upload(imageFiles(e.target.files));
          e.target.value = "";
        }}
      />
      <div
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.kind === "file")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn("rounded-lg transition-colors", over && "bg-accent-soft/60 ring-2 ring-accent")}
      >
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-subtle">
            {uploading ? "Uploading…" : "Only when a picture explains it better than words: paste (⌘V), drop an image here, or use Add."}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {items.map((a) => (
              <li key={a.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpen(a)}
                  className="block w-full overflow-hidden rounded-md border border-border bg-surface-2 outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent"
                  title={a.caption || a.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked API image */}
                  <img src={a.url} alt={a.caption || a.filename} loading="lazy" className="aspect-[4/3] w-full object-cover object-top" />
                </button>
                <p className="mt-1 truncate text-[11px] text-fg-muted" title={a.caption || a.filename}>
                  {a.caption || a.filename}
                </p>
              </li>
            ))}
            {uploading > 0 && (
              <li className="flex aspect-[4/3] animate-pulse items-center justify-center rounded-md bg-surface-2 text-xs text-fg-subtle">
                Uploading…
              </li>
            )}
          </ul>
        )}
      </div>

      <Lightbox
        item={open}
        onClose={() => setOpen(null)}
        onRemove={(a) => setRemoving(a)}
        onCaption={(a, c) => void saveCaption(a, c)}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        pending={busy}
        danger
        title="Remove this screenshot?"
        message={`${removing?.filename ?? ""} is deleted for good.`}
        confirmLabel="Remove"
      />
    </Section>
  );
}

function Lightbox({
  item,
  onClose,
  onRemove,
  onCaption,
}: {
  item: Attachment | null;
  onClose: () => void;
  onRemove: (a: Attachment) => void;
  onCaption: (a: Attachment, caption: string) => void;
}) {
  const ref = useNativeDialog(!!item, onClose);
  const [caption, setCaption] = useState("");
  const [shown, setShown] = useState<Attachment | null>(null);
  if (item !== shown) {
    setShown(item);
    if (item) setCaption(item.caption);
  }
  return (
    <dialog
      ref={ref}
      aria-label={item?.caption || item?.filename || "Screenshot"}
      className="m-auto max-h-[calc(100vh-2rem)] w-[min(1200px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/60"
    >
      {item && (
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="min-w-0 truncate text-[13px] font-medium">{item.filename}</span>
            <span className="shrink-0 text-xs text-fg-subtle">
              {item.width && item.height ? `${item.width}×${item.height} · ` : ""}
              {(item.size / 1024).toFixed(0)} KB · {item.actor} ·{" "}
              <span title={formatDateTime(item.createdAt)}>{relativeTime(item.createdAt)}</span>
            </span>
            <span className="ml-auto flex items-center gap-1">
              <a href={item.url} target="_blank" rel="noreferrer" className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg">
                Open original
              </a>
              <IconButton label="Remove screenshot" size="xs" onClick={() => onRemove(item)}>
                <Trash2 className="size-3.5" />
              </IconButton>
              <IconButton label="Close" size="xs" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked API image */}
            <img src={item.url} alt={item.caption || item.filename} className="mx-auto block max-w-full" />
          </div>
          <form
            className="flex items-center gap-2 border-t border-border px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              onCaption(item, caption.trim());
            }}
          >
            <Input
              inputSize="sm"
              aria-label="Caption"
              placeholder="Caption: what to look at in this picture"
              value={caption}
              maxLength={2000}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => onCaption(item, caption.trim())}
            />
            <Button size="xs" type="submit" variant="secondary">
              Save
            </Button>
          </form>
        </div>
      )}
    </dialog>
  );
}
