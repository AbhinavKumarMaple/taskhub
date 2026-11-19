import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { TaskFilters } from "@/components/lists/task-filters";
import { TaskSheetSlot } from "@/components/lists/task-sheet-slot";
import { PAGE_SIZE } from "@/components/lists/constants";
import { TasksTable } from "@/components/lists/tasks-table";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { param, paramList, spacesFilter } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { Invalid } from "@/server/errors";
import * as svc from "@/server/service";
import { TASK_SORTS } from "@/server/validation";

export const metadata: Metadata = { title: "All tasks" };

type Sort = (typeof TASK_SORTS)[number];

export default async function AllTasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const spaces = spacesFilter(sp);

  const sortParam = param(sp, "sort");
  const sort: Sort = sortParam && (TASK_SORTS as readonly string[]).includes(sortParam) ? (sortParam as Sort) : "updated";
  const orderParam = param(sp, "order");
  const order = orderParam === "asc" || orderParam === "desc" ? orderParam : sort === "updated" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(param(sp, "page")) || 1));

  const filters = {
    q: param(sp, "q"),
    status: paramList(sp, "status"),
    excludeStatus: paramList(sp, "xstatus"),
    type: paramList(sp, "type"),
    priority: paramList(sp, "priority"),
    labels: paramList(sp, "label"),
    assignee: param(sp, "assignee"),
    milestone: param(sp, "milestone"),
  };
  const hasFilters = Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

  const [settings, milestones, list] = await Promise.all([
    svc.getSettings(access),
    svc.listMilestones(access, { spaces }),
    svc
      .listTasks(access, {
        ...filters,
        spaces,
        drafts: "exclude",
        sort,
        order,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .catch((e: unknown) => {
        // A malformed filter in the URL shows an empty table, not an error page.
        if (e instanceof Invalid) return { items: [], total: 0 };
        throw e;
      }),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader title="All tasks" description="Every task that is not a draft or archived." />
      <TaskFilters
        statuses={settings.statuses}
        types={settings.types}
        priorities={settings.priorities}
        labels={settings.labels}
        milestones={milestones.map((m) => ({ ref: m.ref, title: m.title }))}
      />
      {list.total === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={hasFilters ? "No tasks match these filters" : "No tasks yet"}
          description={
            hasFilters
              ? "Clear a filter or change the search to see more."
              : "Create a task from the Board, or ask a connected chat to add one."
          }
        />
      ) : (
        <TasksTable
          items={list.items}
          total={list.total}
          page={page}
          sort={sort}
          order={order}
          statuses={settings.statuses}
        />
      )}
      <TaskSheetSlot taskRef={param(sp, "task")} />
    </div>
  );
}
