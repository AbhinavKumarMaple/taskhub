"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDate, relativeTime } from "@/lib/format";
import { documentHref } from "@/lib/nav";
import type { DocumentSummary, SpaceRef } from "@/lib/types";
import { createDocumentAction } from "@/server/actions/content-actions";
import { ArchivedChip, defaultSpaceId, ListToolbar, SpaceSelect } from "./shared";
import { useActionRunner } from "./use-action";

type Props = {
  documents: DocumentSummary[];
  spaces: SpaceRef[];
  selectedSpace: string | null;
  archived: boolean;
  filtered: boolean;
};

export function DocumentsView({ documents, spaces, selectedSpace, archived, filtered }: Props) {
  const [creating, setCreating] = useState(false);
  const canCreate = spaces.length > 0;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Documents"
        description="Notes, specs and how-tos in markdown, kept per Space."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)} disabled={!canCreate}>
            New document
          </Button>
        }
      />
      <ListToolbar placeholder="Filter documents" />

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={archived ? "No archived documents" : filtered ? "No documents match" : "No documents yet"}
          description={
            archived
              ? "Archived documents appear here. Turn off “Showing archived” to see active ones."
              : filtered
                ? "Try fewer words, or clear the filter."
                : canCreate
                  ? "Write the first one: a spec, a runbook or meeting notes."
                  : "Create a Space first, then add documents to it."
          }
          action={
            !archived && !filtered && canCreate ? (
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                New document
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th scope="col" className="w-24 px-4 py-2 font-medium">Ref</th>
                <th scope="col" className="px-2 py-2 font-medium">Title</th>
                {!selectedSpace && <th scope="col" className="w-40 px-2 py-2 font-medium">Space</th>}
                <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((d) => (
                <tr key={d.ref} className="hover:bg-surface-2/60">
                  <td className="px-4 py-2 font-mono text-xs text-fg-subtle">{d.ref}</td>
                  <td className="max-w-0 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Link href={documentHref(d.ref, selectedSpace)} className="truncate font-medium hover:text-accent">
                        {d.title}
                      </Link>
                      {d.archivedAt && <ArchivedChip />}
                    </div>
                  </td>
                  {!selectedSpace && (
                    <td className="px-2 py-2">
                      <SpaceChip space={d.space} />
                    </td>
                  )}
                  <td className="px-4 py-2 text-right text-xs text-fg-muted" title={formatDate(d.updatedAt, { alwaysYear: true })} suppressHydrationWarning>
                    {relativeTime(d.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewDocumentDialog spaces={spaces} selectedSpace={selectedSpace} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function NewDocumentDialog({
  spaces,
  selectedSpace,
  onClose,
}: {
  spaces: SpaceRef[];
  selectedSpace: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId(spaces, selectedSpace));
  const { run, pending, error } = useActionRunner();

  const save = async () => {
    const t = title.trim();
    if (!t || !spaceId) return;
    const doc = await run(() => createDocumentAction({ spaceId, title: t, body }), { inline: true });
    if (doc) router.push(documentHref(doc.ref, selectedSpace));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New document"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!title.trim() || !spaceId}>
            Create document
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
        <div className="grid grid-cols-[1fr_200px] gap-4">
          <Field label="Title" htmlFor="doc-title">
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required maxLength={200} />
          </Field>
          <Field label="Space" htmlFor="doc-space">
            <SpaceSelect id="doc-space" spaces={spaces} value={spaceId} onChange={setSpaceId} />
          </Field>
        </div>
        <Field label="Body" hint="Optional. You can keep writing after it is created.">
          <MarkdownEditor value={body} onChange={setBody} rows={10} onSubmit={save} aria-label="Body" />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
