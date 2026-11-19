"use client";

import { ArrowUpRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { LabelChip, SpaceChip, TypeChip } from "@/components/ui/chip";
import { useToast } from "@/components/ui/toast";
import { RelTime } from "@/components/ui/misc";
import { promoteDraftAction } from "@/server/actions/lists-actions";
import type { TaskSummary } from "@/lib/types";
import { RefLink, TaskRow, useTaskSheetHref } from "./tasks-table";

export function DraftsList({ items }: { items: TaskSummary[] }) {
  const sheetHref = useTaskSheetHref();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const promote = async (ref: string) => {
    setPending(ref);
    const r = await promoteDraftAction(ref);
    setPending(null);
    if (r.ok) toast.success(`${ref} promoted`, "It now shows on the board and in All tasks.");
    else toast.error("Could not promote", r.error);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-muted">
            <th scope="col" className="h-9 w-24 px-3 font-medium">Ref</th>
            <th scope="col" className="h-9 px-3 font-medium">Title</th>
            <th scope="col" className="h-9 w-28 px-3 font-medium">Type</th>
            <th scope="col" className="h-9 w-36 px-3 font-medium">Space</th>
            <th scope="col" className="h-9 w-32 px-3 font-medium">Labels</th>
            <th scope="col" className="h-9 w-24 px-3 font-medium">Updated</th>
            <th scope="col" className="h-9 w-44 px-3 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <TaskRow key={t.ref} href={sheetHref(t.ref)}>
              <td className="px-3 py-2">
                <RefLink href={sheetHref(t.ref)}>{t.ref}</RefLink>
              </td>
              <td className="truncate px-3 py-2 font-medium" title={t.title}>
                {t.title}
              </td>
              <td className="px-3 py-2">
                <TypeChip type={t.type} />
              </td>
              <td className="px-3 py-2">
                <SpaceChip space={t.space} />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1 overflow-hidden">
                  {t.labels.map((l) => (
                    <LabelChip key={l} label={l} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted tabular-nums">
                  <RelTime date={t.updatedAt} />
                </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Link href={sheetHref(t.ref)} scroll={false} className={buttonClass("ghost", "xs")}>
                    <Pencil className="size-3" aria-hidden />
                    Edit
                  </Link>
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<ArrowUpRight className="size-3" aria-hidden />}
                    loading={pending === t.ref}
                    onClick={() => void promote(t.ref)}
                  >
                    Promote
                  </Button>
                </div>
              </td>
            </TaskRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
