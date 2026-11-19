"use client";

import { Plus, Scale } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceChip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TabLinks } from "@/components/ui/tabs";
import { formatDate, relativeTime } from "@/lib/format";
import { decisionHref, withParams } from "@/lib/nav";
import { DECISION_STATUSES, type DecisionStatus, type DecisionSummary, type SpaceRef } from "@/lib/types";
import { createDecisionAction } from "@/server/actions/content-actions";
import { ArchivedChip, DecisionStatusChip, defaultSpaceId, ListToolbar, SpaceSelect } from "./shared";
import { useActionRunner } from "./use-action";

type Props = {
  decisions: DecisionSummary[];
  total: number;
  counts: Record<DecisionStatus, number>;
  status: DecisionStatus | null;
  spaces: SpaceRef[];
  selectedSpace: string | null;
  archived: boolean;
  filtered: boolean;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DecisionsView({ decisions, total, counts, status, spaces, selectedSpace, archived, filtered }: Props) {
  const [creating, setCreating] = useState(false);
  const sp = useSearchParams();
  const pathname = usePathname();
  const canCreate = spaces.length > 0;

  const tabs = [
    { href: withParams(sp, { status: null }, pathname), label: "All", active: !status, count: total },
    ...DECISION_STATUSES.map((s) => ({
      href: withParams(sp, { status: s }, pathname),
      label: cap(s),
      active: status === s,
      count: counts[s],
    })),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Decisions"
        description="Architecture-style decision records: the context, what was decided and what follows from it."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)} disabled={!canCreate}>
            New decision
          </Button>
        }
      />
      <TabLinks tabs={tabs} />
      <div className="h-3" />
      <ListToolbar placeholder="Filter decisions" />

      {decisions.length === 0 ? (
        <EmptyState
          icon={<Scale />}
          title={archived ? "No archived decisions" : filtered ? "No decisions match" : "No decisions yet"}
          description={
            archived
              ? "Archived decisions appear here. Turn off “Showing archived” to see active ones."
              : filtered
                ? "Try another status tab, fewer words, or clear the filter."
                : canCreate
                  ? "Record a decision when you choose between options, so later chats know why."
                  : "Create a Space first, then record decisions in it."
          }
          action={
            !archived && !filtered && canCreate ? (
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                New decision
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
                <th scope="col" className="w-32 px-2 py-2 font-medium">Status</th>
                {!selectedSpace && <th scope="col" className="w-40 px-2 py-2 font-medium">Space</th>}
                <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {decisions.map((d) => (
                <tr key={d.ref} className="hover:bg-surface-2/60">
                  <td className="px-4 py-2 font-mono text-xs text-fg-subtle">{d.ref}</td>
                  <td className="max-w-0 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Link href={decisionHref(d.ref, selectedSpace)} className="truncate font-medium hover:text-accent">
                        {d.title}
                      </Link>
                      {d.archivedAt && <ArchivedChip />}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <DecisionStatusChip status={d.status} size="xs" />
                  </td>
                  {!selectedSpace && (
                    <td className="px-2 py-2">
                      <SpaceChip space={d.space} />
                    </td>
                  )}
                  <td
                    className="px-4 py-2 text-right text-xs text-fg-muted"
                    title={formatDate(d.updatedAt, { alwaysYear: true })}
                    suppressHydrationWarning
                  >
                    {relativeTime(d.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewDecisionDialog spaces={spaces} selectedSpace={selectedSpace} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewDecisionDialog({
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
  const [status, setStatus] = useState<DecisionStatus>("proposed");
  const [spaceId, setSpaceId] = useState(defaultSpaceId(spaces, selectedSpace));
  const { run, pending, error } = useActionRunner();

  const save = async () => {
    const t = title.trim();
    if (!t || !spaceId) return;
    const d = await run(() => createDecisionAction({ spaceId, title: t, status }), { inline: true });
    if (d) router.push(decisionHref(d.ref, selectedSpace));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New decision"
      description="Give it a title now; write the context, decision and consequences on the next page."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending} disabled={!title.trim() || !spaceId}>
            Create decision
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
        <Field label="Title" htmlFor="dec-title">
          <Input
            id="dec-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
            maxLength={200}
            placeholder="Use Postgres for storage"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Space" htmlFor="dec-space">
            <SpaceSelect id="dec-space" spaces={spaces} value={spaceId} onChange={setSpaceId} />
          </Field>
          <Field label="Status" htmlFor="dec-status">
            <Select
              id="dec-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DecisionStatus)}
              options={DECISION_STATUSES.map((s) => ({ value: s, label: cap(s) }))}
            />
          </Field>
        </div>
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
