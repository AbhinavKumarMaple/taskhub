"use client";

import { Archive, ArchiveRestore, ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { formatDateTime } from "@/lib/format";
import { href } from "@/lib/nav";
import type { DocumentFull } from "@/lib/types";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
  updateDocumentAction,
} from "@/server/actions/content-actions";
import { ArchivedChip, MetaLine } from "./shared";
import { EditableTitle, useUnsavedWarning } from "./editable";
import { useActionRunner } from "./use-action";

export function DocumentDetail({ doc, selectedSpace }: { doc: DocumentFull; selectedSpace: string | null }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(doc.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, pending } = useActionRunner();
  const archived = !!doc.archivedAt;
  const dirty = editing && body !== doc.body;
  useUnsavedWarning(dirty);

  const listHref = href("/documents", { archived: archived ? "1" : null }, selectedSpace);

  const saveBody = async () => {
    if (body === doc.body) return setEditing(false);
    const ok = await run(() => updateDocumentAction(doc.ref, { body }), { success: "Saved" });
    if (ok) setEditing(false);
  };

  const items: MenuItem[] = archived
    ? [
        { label: "Restore", icon: <ArchiveRestore />, onSelect: () => run(() => restoreDocumentAction(doc.ref), { success: `Restored ${doc.ref}` }) },
        "separator",
        { label: "Delete forever…", icon: <Trash2 />, danger: true, onSelect: () => setConfirmDelete(true) },
      ]
    : [{ label: "Archive", icon: <Archive />, onSelect: () => run(() => archiveDocumentAction(doc.ref), { success: `Archived ${doc.ref}` }) }];

  return (
    <div className="max-w-4xl">
      <Link href={listHref} className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Documents
      </Link>

      <div className="flex flex-wrap items-start gap-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">{doc.ref}</span>
            <CopyButton value={doc.ref} label={`Copy ${doc.ref}`} size="xs" />
            <SpaceChip space={doc.space} />
            {archived && <ArchivedChip />}
          </div>
          <EditableTitle
            value={doc.title}
            disabled={archived}
            label="Document title"
            onSave={(title) => run(() => updateDocumentAction(doc.ref, { title }), { success: "Title saved" })}
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          {!archived &&
            (editing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setBody(doc.body);
                    setEditing(false);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={saveBody} loading={pending}>
                  Save
                </Button>
              </>
            ) : (
              <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ))}
          <CopyButton
            value={() => window.location.origin + href(`/documents/${doc.ref}`)}
            label="Copy link"
            variant="secondary"
            size="md"
          />
          <DropdownMenu label="More actions" trigger={<MoreHorizontal className="size-4" />} items={items} />
        </div>
      </div>
      <MetaLine items={[`Created ${formatDateTime(doc.createdAt)}`, `Updated ${formatDateTime(doc.updatedAt)}`]} />

      <div className="mt-5">
        {editing ? (
          <MarkdownEditor value={body} onChange={setBody} rows={24} autoFocus onSubmit={saveBody} aria-label="Document body" />
        ) : (
          <div className="rounded-lg border border-border bg-surface px-6 py-5">
            <Markdown empty={archived ? "This document is empty." : "This document is empty. Choose Edit to write it."}>
              {doc.body}
            </Markdown>
          </div>
        )}
        {editing && <p className="mt-2 text-xs text-fg-subtle">⌘ Enter saves.</p>}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc.ref} forever?`}
        message="The document is removed for good. Its activity history stays."
        confirmLabel="Delete forever"
        danger
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteDocumentAction(doc.ref, listHref));
        }}
      />
    </div>
  );
}
