"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip, StatusChip, TypeChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { RelTime, TH_CLASS } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { DecisionStatusChip } from "@/components/content/shared";
import type { DecisionStatus } from "@/lib/types";
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
  // Tasks show type + status columns; decisions a status column; documents and milestones neither.
  const hasKind = kind === "task" || rows.some((r) => r.status);

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
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              <th scope="col" className={cn(TH_CLASS, "w-24")}>Ref</th>
              <th scope="col" className={TH_CLASS}>Title</th>
              {hasKind && (
                <th scope="col" className={cn(TH_CLASS, "w-28")}>
                  {kind === "task" ? "Type" : "Status"}
                </th>
              )}
              {kind === "task" && <th scope="col" className={cn(TH_CLASS, "w-28")}>Status</th>}
              <th scope="col" className={cn(TH_CLASS, "w-36")}>Space</th>
              <th scope="col" className={cn(TH_CLASS, "w-24")}>Archived</th>
              <th scope="col" className={cn(TH_CLASS, "w-52")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const link = kind === "task" ? sheetHref(row.ref) : row.href;
              return (
                <tr key={row.ref} className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
                  <td className="px-3 py-2 font-mono text-xs text-fg-muted">{row.ref}</td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {link ? (
                        <Link href={link} scroll={false} className="truncate font-medium hover:text-accent" title={row.title}>
                          {row.title}
                        </Link>
                      ) : (
                        <span className="truncate font-medium" title={row.title}>
                          {row.title}
                        </span>
                      )}
                      {row.draft && <span className="shrink-0 text-xs text-fg-subtle">draft</span>}
                    </div>
                  </td>
                  {hasKind && (
                    <td className="px-3 py-2">
                      {kind === "task"
                        ? row.type && <TypeChip type={row.type} />
                        : row.status &&
                          (kind === "decision" ? (
                            <DecisionStatusChip status={row.status as DecisionStatus} size="xs" />
                          ) : (
                            <StatusChip status={row.status} statuses={statuses} size="xs" />
                          ))}
                    </td>
                  )}
                  {kind === "task" && (
                    <td className="px-3 py-2">{row.status && <StatusChip status={row.status} statuses={statuses} size="xs" />}</td>
                  )}
                  <td className="px-3 py-2">
                    <SpaceChip space={row.space} />
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted tabular-nums">
                    {row.archivedAt ? <RelTime date={row.archivedAt} /> : ""}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
