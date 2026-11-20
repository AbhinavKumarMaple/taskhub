import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { redirect } from "next/navigation";
import { NewTaskButton } from "@/components/lists/new-draft-button";
import { TaskFilters } from "@/components/lists/task-filters";
import { TaskSheetSlot } from "@/components/lists/task-sheet-slot";
import { PAGE_SIZE } from "@/components/lists/constants";
import { TasksTable } from "@/components/lists/tasks-table";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { param, paramList, spacesFilter, withParams } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { isAppError } from "@/server/errors";
import * as svc from "@/server/service";
import { TASK_SORTS } from "@/server/validation";

export const metadata: Metadata = { title: "All tasks" };

type Sort = (typeof TASK_SORTS)[number];

/** ?deploy=code | plain | live:<env> | not:<env> → list filters. */
function deployFilter(v: string | undefined): { deployable?: boolean; deployedTo?: string[]; notDeployedTo?: string } {
  if (!v) return {};
  if (v === "code") return { deployable: true };
  if (v === "plain") return { deployable: false };
  if (v.startsWith("live:") && v.length > 5) return { deployedTo: [v.slice(5)] };
  if (v.startsWith("not:") && v.length > 4) return { notDeployedTo: v.slice(4) };
  return {};
}

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
    ...deployFilter(param(sp, "deploy")),
  };
  const hasFilters = Object.values(filters).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === "boolean" || !!v));

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
      .then((l) => ({ ...l, error: null as string | null }))
      .catch((e: unknown) => {
        // A malformed filter in the URL shows an empty table with the reason, not an error page.
        if (isAppError(e)) return { items: [], total: 0, error: e.message };
        throw e;
      }),
  ]);

  // A page number past the end (e.g. after filtering) goes to the last page instead of an empty table.
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  if (page > pages) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
    redirect(withParams(q, { page: pages > 1 ? pages : null }, "/tasks"));
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="All tasks"
        description="Every task that is not a draft or archived."
        actions={<NewTaskButton size="md" />}
      />
      <TaskFilters
        statuses={settings.statuses}
        types={settings.types}
        priorities={settings.priorities}
        labels={settings.labels}
        milestones={milestones.map((m) => ({ ref: m.ref, title: m.title }))}
        environments={settings.environments}
      />
      {list.error ? (
        <EmptyState icon={<ListChecks />} title="These filters could not be applied" description={list.error} />
      ) : list.total === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={hasFilters ? "No tasks match these filters" : "No tasks yet"}
          description={
            hasFilters
              ? "Clear a filter or change the search to see more."
              : "Use New task above, or ask a connected chat to add one."
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
          environments={settings.environments}
          doneStatus={settings.doneStatus}
        />
      )}
      <TaskSheetSlot taskRef={param(sp, "task")} />
    </div>
  );
}
