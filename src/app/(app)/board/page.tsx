import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardView } from "@/components/board/board-view";
import { BoardFilterBar } from "@/components/board/filter-bar";
import { TaskSheet } from "@/components/task/task-sheet";
import { param, paramList, selectedSpace, spacesFilter } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { isAppError } from "@/server/errors";
import * as svc from "@/server/service";
import type { ListTasksInput } from "@/server/validation";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const spaces = spacesFilter(sp);
  const space = selectedSpace(sp);

  const filters = {
    type: paramList(sp, "type"),
    labels: paramList(sp, "label"),
    priority: paramList(sp, "priority"),
    assignee: param(sp, "assignee"),
    milestone: param(sp, "milestone"),
    q: param(sp, "q"),
  };
  const grouped = param(sp, "group") === "milestone";
  const taskRef = param(sp, "task");
  const exportFilters: ListTasksInput = { ...filters, spaces };

  const [settings, spaceRefs, milestones, version, list] = await Promise.all([
    svc.getSettings(access),
    svc.listSpaceRefs(access),
    svc.listMilestones(access, { spaces }),
    svc.getVersion(access, { spaces }),
    svc
      .listTasks(access, { ...exportFilters, drafts: "exclude", sort: "ordinal", limit: 1000 })
      .then((l) => ({ ...l, error: null as string | null }))
      .catch((e: unknown) => {
        // A malformed filter in the URL shows an empty board with the reason, not an error page.
        if (isAppError(e)) return { items: [], total: 0, error: e.message };
        throw e;
      }),
  ]);

  const activeSpaces = spaceRefs
    .filter((s) => !s.archived)
    .map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const assignees = Array.from(new Set(list.items.flatMap((t) => t.assignees))).sort();
  const labels = Array.from(new Set([...settings.labels, ...list.items.flatMap((t) => t.labels)]));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <BoardFilterBar
        spaces={activeSpaces}
        types={settings.types}
        priorities={settings.priorities}
        labels={labels}
        assignees={assignees}
        milestones={milestones.map((m) => ({ ref: m.ref, title: m.title }))}
        exportFilters={exportFilters}
        total={list.total}
      />
      <BoardView
        tasks={list.items}
        error={list.error}
        statuses={settings.statuses}
        doneStatus={settings.doneStatus}
        milestones={milestones.map((m) => ({ ref: m.ref, title: m.title, spaceId: m.space.id }))}
        spaces={activeSpaces}
        space={space}
        grouped={grouped}
        filters={filters}
        version={version}
      />
      {taskRef && (
        <Suspense fallback={null}>
          <TaskSheet taskRef={taskRef} />
        </Suspense>
      )}
    </div>
  );
}
