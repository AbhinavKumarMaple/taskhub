"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip, StatusChip, TypeChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { deleteArchivedAction, restoreArchivedAction, type ArchiveKind } from "@/server/actions/lists-actions";
import type { SpaceRef } from "@/lib/types";
import { useTaskSheetHref } from "./tasks-table";

export type ArchiveRow = {
  ref: string;
  title: string;
  space: SpaceRef;
  archivedAt: Date | null;
  /** Task type. */
  type?: string;
  /** Task or decision status. */
  status?: string;
  /** Page link (documents, decisions). Tasks open the sheet. */
  href?: string;
  draft?: boolean;
};

const NOUN: Record<ArchiveKind, string> = { task: "task", document: "document", decision: "decision", milestone: "milestone" };

export function ArchiveList({ kind, rows, statuses }: { kind: ArchiveKind; rows: ArchiveRow[]; statuses?: string[] }) {
  const sheetHref = useTaskSheetHref();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ArchiveRow | null>(null);

  const restore = async (ref: string) => {
    setBusy(ref);
    const r = await restoreArchivedAction(kind, ref);
    setBusy(null);
    if (r.ok) toast.success(`${ref} restored`);
    else toast.error("Could not restore", r.error);
  };
  const remove = async () => {
    if (!confirm) return;
    setBusy(confirm.ref);
    const r = await deleteArchivedAction(kind, confirm.ref);
    setBusy(null);
    if (r.ok) {
      toast.success(`${confirm.ref} deleted`);
      setConfirm(null);
    } else toast.error("Could not delete", r.error);
  };

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((row) => {
          const link = kind === "task" ? sheetHref(row.ref) : row.href;
          return (
            <li key={row.ref} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="w-20 shrink-0 font-mono text-xs text-fg-muted">{row.ref}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {link ? (
                  <Link href={link} scroll={false} className="truncate font-medium hover:text-accent">
                    {row.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{row.title}</span>
                )}
                {row.type && <TypeChip type={row.type} />}
                {row.status && <StatusChip status={row.status} statuses={statuses} size="xs" />}
                {row.draft && <span className="text-xs text-fg-subtle">draft</span>}
              </div>
              <SpaceChip space={row.space} className="hidden md:inline-flex" />
              <span className="hidden w-28 shrink-0 text-xs text-fg-muted tabular-nums lg:inline">
                {row.archivedAt ? `Archived ${formatDate(row.archivedAt)}` : ""}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={<RotateCcw className="size-3" aria-hidden />}
                  loading={busy === row.ref && !confirm}
                  onClick={() => void restore(row.ref)}
                >
                  Restore
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<Trash2 className="size-3" aria-hidden />}
                  onClick={() => setConfirm(row)}
                  className="hover:text-danger"
                >
                  Delete forever
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        title={confirm ? `Delete ${confirm.ref} forever?` : "Delete forever?"}
        message={
          confirm
            ? `“${confirm.title}” will be removed for good. Its activity history stays. This cannot be undone.${
                kind === "task" ? " A task with subtasks must have them deleted first." : ""
              }`
            : undefined
        }
        confirmLabel={`Delete ${NOUN[kind]}`}
        danger
        pending={!!confirm && busy === confirm.ref}
      />
    </>
  );
}
