import type { Metadata } from "next";
import { Archive } from "lucide-react";
import { ArchiveList, type ArchiveRow } from "@/components/lists/archive-list";
import { TaskSheetSlot } from "@/components/lists/task-sheet-slot";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TabLinks } from "@/components/ui/tabs";
import { decisionHref, documentHref, href, param, selectedSpace, spacesFilter } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import * as svc from "@/server/service";

export const metadata: Metadata = { title: "Archive" };

const TABS = [
  { value: "tasks", label: "Tasks", kind: "task" },
  { value: "documents", label: "Documents", kind: "document" },
  { value: "decisions", label: "Decisions", kind: "decision" },
  { value: "milestones", label: "Milestones", kind: "milestone" },
] as const;

export default async function ArchivePage({ searchParams }: PageProps<"/archive">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const spaces = spacesFilter(sp);
  const spaceId = selectedSpace(sp);
  const tab = TABS.find((t) => t.value === param(sp, "tab")) ?? TABS[0];

  const [settings, tasks, docs, decisions, milestones] = await Promise.all([
    svc.getSettings(access),
    svc.listTasks(access, { spaces, archivedOnly: true, drafts: "include", sort: "updated", order: "desc", limit: 1000 }),
    svc.listDocuments(access, { spaces, archivedOnly: true }),
    svc.listDecisions(access, { spaces, archivedOnly: true }),
    svc.listMilestones(access, { spaces, archivedOnly: true }),
  ]);

  const rows: Record<(typeof TABS)[number]["value"], ArchiveRow[]> = {
    tasks: tasks.items.map((t) => ({
      ref: t.ref,
      title: t.title,
      space: t.space,
      archivedAt: t.archivedAt,
      type: t.type,
      status: t.status,
      draft: t.isDraft,
    })),
    documents: docs.map((d) => ({ ref: d.ref, title: d.title, space: d.space, archivedAt: d.archivedAt, href: documentHref(d.ref, spaceId) })),
    decisions: decisions.map((d) => ({
      ref: d.ref,
      title: d.title,
      space: d.space,
      archivedAt: d.archivedAt,
      status: d.status,
      href: decisionHref(d.ref, spaceId),
    })),
    milestones: milestones.map((m) => ({ ref: m.ref, title: m.title, space: m.space, archivedAt: m.archivedAt })),
  };
  const counts = { tasks: tasks.total, documents: docs.length, decisions: decisions.length, milestones: milestones.length };
  const current = rows[tab.value];

  return (
    <div className="flex flex-col">
      <PageHeader title="Archive" description="Archived items stay out of every list. Restore them, or delete them for good." />
      <TabLinks
        className="mb-4"
        tabs={TABS.map((t) => ({
          href: href("/archive", { tab: t.value === "tasks" ? null : t.value }, spaceId),
          label: t.label,
          active: t.value === tab.value,
          count: counts[t.value],
        }))}
      />
      {current.length === 0 ? (
        <EmptyState
          icon={<Archive />}
          title={`No archived ${tab.label.toLowerCase()}`}
          description={
            tab.value === "tasks"
              ? "Archive a task from its detail view, or clean up Done tasks from a board column menu."
              : `Archive ${tab.label.toLowerCase()} from their own page when you no longer need them.`
          }
        />
      ) : (
        <ArchiveList kind={tab.kind} rows={current} statuses={tab.kind === "task" ? settings.statuses : undefined} />
      )}
      {tab.value === "tasks" && <TaskSheetSlot taskRef={param(sp, "task")} />}
    </div>
  );
}
