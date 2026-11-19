"use client";

import { Archive, ArchiveRestore, Eye, EyeOff, KanbanSquare, Layers, MoreHorizontal, Pencil, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { SpaceDot, StatusChip, SWATCH_CLASS } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatDate, maskSecret, pluralize } from "@/lib/format";
import { href } from "@/lib/nav";
import { SPACE_COLORS, type Space, type SpaceColor, type SpaceWithCounts } from "@/lib/types";
import {
  archiveSpaceAction,
  createSpaceAction,
  regenerateSpaceKeyAction,
  restoreSpaceAction,
  updateSpaceAction,
} from "@/server/actions/content-actions";
import { ArchivedChip } from "./shared";
import { useActionRunner } from "./use-action";

export function SpacesView({ spaces, statuses }: { spaces: SpaceWithCounts[]; statuses: string[] }) {
  const [editing, setEditing] = useState<SpaceWithCounts | "new" | null>(null);
  const [regenerating, setRegenerating] = useState<SpaceWithCounts | null>(null);
  const [archiving, setArchiving] = useState<SpaceWithCounts | null>(null);
  const [created, setCreated] = useState<Space | null>(null);
  const { run, pending } = useActionRunner();

  const active = spaces.filter((s) => !s.archivedAt);
  const archived = spaces.filter((s) => s.archivedAt);

  const rowProps = (s: SpaceWithCounts) => ({
    space: s,
    statuses,
    onEdit: () => setEditing(s),
    onRegenerate: () => setRegenerating(s),
    onArchive: () => setArchiving(s),
    onRestore: () => run(() => restoreSpaceAction(s.id), { success: `Restored ${s.name}` }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Spaces"
        description="Each Space is a separate board. A chat can only see the Spaces whose key it holds; give a chat another key to share that work with it."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
            New Space
          </Button>
        }
      />

      {created && <CreatedNotice space={created} onDismiss={() => setCreated(null)} />}

      {active.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No active Spaces"
          description="Create a Space for a project or for one chat's work. You get a key to hand to the chat."
          action={
            <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
              New Space
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((s) => (
            <SpaceRow key={s.id} {...rowProps(s)} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-8" aria-labelledby="archived-spaces">
          <h2 id="archived-spaces" className="pb-2 text-[13px] font-semibold text-fg-muted">
            Archived · {archived.length}
          </h2>
          <p className="pb-3 text-xs text-fg-subtle">
            Archived Spaces are hidden from the board and lists. Their keys keep working until you regenerate them.
          </p>
          <ul className="flex flex-col gap-3">
            {archived.map((s) => (
              <SpaceRow key={s.id} {...rowProps(s)} />
            ))}
          </ul>
        </section>
      )}

      <SpaceDialog
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        space={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onCreated={setCreated}
      />
      <ConfirmDialog
        open={!!regenerating}
        onClose={() => setRegenerating(null)}
        title={`Regenerate the key for ${regenerating?.name}?`}
        message="The current key stops working at once. Every chat using it will need the new key."
        confirmLabel="Regenerate key"
        danger
        pending={pending}
        onConfirm={async () => {
          if (!regenerating) return;
          const ok = await run(() => regenerateSpaceKeyAction(regenerating.id), { success: "New key created" });
          if (ok) setRegenerating(null);
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name}?`}
        message="Its tasks, documents and decisions are hidden from lists until you restore it. Nothing is deleted."
        confirmLabel="Archive Space"
        pending={pending}
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(() => archiveSpaceAction(archiving.id), { success: `Archived ${archiving.name}` });
          if (ok) setArchiving(null);
        }}
      />
    </div>
  );
}

function SpaceRow({
  space: s,
  statuses,
  onEdit,
  onRegenerate,
  onArchive,
  onRestore,
}: {
  space: SpaceWithCounts;
  statuses: string[];
  onEdit: () => void;
  onRegenerate: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const isArchived = !!s.archivedAt;
  const items: MenuItem[] = [
    { label: "Edit name, colour, description", icon: <Pencil />, onSelect: onEdit },
    { label: "Regenerate key…", icon: <RefreshCw />, onSelect: onRegenerate },
    "separator",
    isArchived
      ? { label: "Restore", icon: <ArchiveRestore />, onSelect: onRestore }
      : { label: "Archive…", icon: <Archive />, onSelect: onArchive },
  ];
  return (
    <li className={cn("rounded-lg border border-border bg-surface px-4 py-3", isArchived && "opacity-80")}>
      <div className="flex items-start gap-3">
        <SpaceDot color={s.color} className="mt-1.5 size-2.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold">{s.name}</h3>
            {isArchived && <ArchivedChip />}
            <span className="text-xs text-fg-subtle">Created {formatDate(s.createdAt)}</span>
          </div>
          {s.description && <p className="mt-0.5 text-[13px] text-fg-muted">{s.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isArchived && (
            <Link
              href={href("/board", { type: "feature" }, s.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <KanbanSquare className="size-3.5" aria-hidden /> Board
            </Link>
          )}
          <DropdownMenu label={`Actions for ${s.name}`} trigger={<MoreHorizontal className="size-4" />} items={items} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 pl-5.5 text-[13px] md:grid-cols-[auto_1fr]">
        <dt className="text-xs leading-7 text-fg-muted">Space id</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <code className="truncate font-mono text-xs">{s.id}</code>
          <CopyButton value={s.id} label="Copy Space id" size="xs" />
        </dd>
        <dt className="text-xs leading-7 text-fg-muted">Key</dt>
        <dd>
          <SecretKey value={s.key} />
        </dd>
        <dt className="text-xs leading-7 text-fg-muted">Tasks</dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-fg-muted">
          <span className="text-fg">
            {s.counts.open} open of {s.counts.total}
          </span>
          {statuses.map((st) =>
            s.counts.byStatus[st] ? (
              <span key={st} className="inline-flex items-center gap-1">
                <StatusChip status={st} statuses={statuses} size="xs" />
                <span className="tabular-nums">{s.counts.byStatus[st]}</span>
              </span>
            ) : null,
          )}
          {s.counts.drafts > 0 && <span>{pluralize(s.counts.drafts, "draft")}</span>}
          {s.counts.archived > 0 && <span>{s.counts.archived} archived</span>}
        </dd>
      </dl>
    </li>
  );
}

/** Masked key with reveal and copy. */
function SecretKey({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-xs" aria-label={shown ? "Space key" : "Space key, hidden"}>
        {shown ? value : maskSecret(value)}
      </code>
      <IconButton label={shown ? "Hide key" : "Reveal key"} size="xs" onClick={() => setShown((v) => !v)} aria-pressed={shown}>
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </IconButton>
      <CopyButton value={value} label="Copy key" size="xs" />
    </span>
  );
}

function CreatedNotice({ space, onDismiss }: { space: Space; onDismiss: () => void }) {
  return (
    <div role="status" className="mb-4 rounded-lg border border-done/40 bg-done-soft px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-done-fg">Created {space.name}</p>
          <p className="mt-0.5 text-fg-muted">
            Give this key to the chat that should work in it. You can copy it from this page at any time.
          </p>
          <div className="mt-2">
            <SecretKey value={space.key} />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function SpaceDialog({
  open,
  space,
  onClose,
  onCreated,
}: {
  open: boolean;
  space: SpaceWithCounts | null;
  onClose: () => void;
  onCreated: (s: Space) => void;
}) {
  const [name, setName] = useState(space?.name ?? "");
  const [description, setDescription] = useState(space?.description ?? "");
  const [color, setColor] = useState<SpaceColor>(space?.color ?? "blue");
  const { run, pending, error } = useActionRunner();

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    if (space) {
      const ok = await run(() => updateSpaceAction(space.id, { name: n, description: description.trim(), color }), {
        inline: true,
        success: "Space saved",
      });
      if (ok) onClose();
    } else {
      const s = await run(() => createSpaceAction({ name: n, description: description.trim(), color }), { inline: true });
      if (s) {
        onCreated(s);
        onClose();
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={space ? `Edit ${space.name}` : "New Space"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!name.trim()}>
            {space ? "Save" : "Create Space"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" htmlFor="space-name" error={error ?? undefined}>
          <Input
            id="space-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            maxLength={200}
            aria-invalid={!!error || undefined}
            placeholder="Home lab"
          />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-xs font-medium text-fg-muted">Colour</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
            {SPACE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                title={c}
                onClick={() => setColor(c)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border transition-colors",
                  color === c ? "border-fg" : "border-transparent hover:border-border-strong",
                )}
              >
                <span className={cn("size-4 rounded-full", SWATCH_CLASS[c])} />
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Description" htmlFor="space-desc" hint="Optional. What this Space is for.">
          <Textarea id="space-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} />
        </Field>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
