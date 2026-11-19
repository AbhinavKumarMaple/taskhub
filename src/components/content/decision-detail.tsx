"use client";

import { Archive, ArchiveRestore, ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { formatDateTime } from "@/lib/format";
import { href } from "@/lib/nav";
import { DECISION_STATUSES, type DecisionFull, type DecisionStatus } from "@/lib/types";
import {
  archiveDecisionAction,
  deleteDecisionAction,
  restoreDecisionAction,
  updateDecisionAction,
} from "@/server/actions/content-actions";
import { EditableTitle, useUnsavedWarning } from "./editable";
import { ArchivedChip, DecisionStatusChip, MetaLine } from "./shared";
import { useActionRunner } from "./use-action";

type Section = "context" | "decision" | "consequences";
const SECTIONS: { key: Section; title: string; hint: string }[] = [
  { key: "context", title: "Context", hint: "What is the situation, and what forces are at play?" },
  { key: "decision", title: "Decision", hint: "What was chosen, in a few sentences." },
  { key: "consequences", title: "Consequences", hint: "What becomes easier or harder because of it?" },
];

export function DecisionDetail({ decision, selectedSpace }: { decision: DecisionFull; selectedSpace: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<Section, string>>(() => pick(decision));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, pending } = useActionRunner();
  const archived = !!decision.archivedAt;
  const saved = pick(decision);
  const dirty = editing && SECTIONS.some((s) => draft[s.key] !== saved[s.key]);
  useUnsavedWarning(dirty);

  const listHref = href("/decisions", { archived: archived ? "1" : null }, selectedSpace);

  const save = async () => {
    const changes: Partial<Record<Section, string>> = {};
    for (const s of SECTIONS) if (draft[s.key] !== saved[s.key]) changes[s.key] = draft[s.key];
    if (!Object.keys(changes).length) return setEditing(false);
    const ok = await run(() => updateDecisionAction(decision.ref, changes), { success: "Saved" });
    if (ok) setEditing(false);
  };

  const setStatus = (status: DecisionStatus) => {
    if (status === decision.status) return;
    void run(() => updateDecisionAction(decision.ref, { status }), { success: `Status set to ${status}` });
  };

  const items: MenuItem[] = archived
    ? [
        {
          label: "Restore",
          icon: <ArchiveRestore />,
          onSelect: () => run(() => restoreDecisionAction(decision.ref), { success: `Restored ${decision.ref}` }),
        },
        "separator",
        { label: "Delete forever…", icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(true) },
      ]
    : [
        {
          label: "Archive",
          icon: <Archive />,
          onSelect: () => run(() => archiveDecisionAction(decision.ref), { success: `Archived ${decision.ref}` }),
        },
      ];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={listHref} className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Decisions
      </Link>

      <div className="flex flex-wrap items-start gap-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">{decision.ref}</span>
            <CopyButton value={decision.ref} label={`Copy ${decision.ref}`} size="xs" />
            <DecisionStatusChip status={decision.status} size="xs" />
            <SpaceChip space={decision.space} />
            {archived && <ArchivedChip />}
          </div>
          <EditableTitle
            value={decision.title}
            disabled={archived}
            label="Decision title"
            onSave={(title) => run(() => updateDecisionAction(decision.ref, { title }), { success: "Title saved" })}
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          {!archived && (
            <Select
              aria-label="Status"
              value={decision.status}
              disabled={pending}
              onChange={(e) => setStatus(e.target.value as DecisionStatus)}
              options={DECISION_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              className="w-36"
            />
          )}
          {!archived &&
            (editing ? (
              <>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setDraft(saved);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={save} loading={pending}>
                  Save
                </Button>
              </>
            ) : (
              <Button
                icon={<Pencil className="size-3.5" />}
                onClick={() => {
                  setDraft(saved);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            ))}
          <CopyButton
            value={() => window.location.origin + href(`/decisions/${decision.ref}`)}
            label="Copy link"
            variant="secondary"
            size="md"
          />
          <DropdownMenu label="More actions" trigger={<MoreHorizontal className="size-4" />} items={items} />
        </div>
      </div>
      <MetaLine
        items={[`Created ${formatDateTime(decision.createdAt)}`, `Updated ${formatDateTime(decision.updatedAt)}`]}
      />

      <div className="mt-5 flex flex-col gap-4">
        {SECTIONS.map((s, i) => (
          <section key={s.key} aria-labelledby={`sec-${s.key}`} className="rounded-lg border border-border bg-surface">
            <h2 id={`sec-${s.key}`} className="border-b border-border px-5 py-2.5 text-[13px] font-semibold">
              {s.title}
            </h2>
            <div className="px-5 py-4">
              {editing ? (
                <MarkdownEditor
                  value={draft[s.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))}
                  rows={6}
                  autoFocus={i === 0}
                  placeholder={s.hint}
                  onSubmit={save}
                  aria-label={s.title}
                />
              ) : (
                <Markdown empty={archived ? "Not written." : `Not written yet. ${s.hint}`}>{decision[s.key]}</Markdown>
              )}
            </div>
          </section>
        ))}
        {editing && <p className="text-xs text-fg-subtle">⌘ Enter saves all three sections.</p>}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${decision.ref} forever?`}
        message="The decision record is removed for good. Its activity history stays."
        confirmLabel="Delete forever"
        danger
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteDecisionAction(decision.ref, listHref));
        }}
      />
    </div>
  );
}

function pick(d: DecisionFull): Record<Section, string> {
  return { context: d.context, decision: d.decision, consequences: d.consequences };
}
