import type { Metadata } from "next";
import { CountBars, Panel, StatCard, TaskMiniList, WeeklyChart } from "@/components/lists/stats-charts";
import { TaskSheetSlot } from "@/components/lists/task-sheet-slot";
import { statusTone } from "@/components/ui/chip";
import { PageHeader, ProgressBar } from "@/components/ui/misc";
import { pluralize } from "@/lib/format";
import { param, spacesFilter, withParams, type SearchParamsRecord } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import * as svc from "@/server/service";

export const metadata: Metadata = { title: "Statistics" };

const TONE_BAR: Record<string, string> = { todo: "bg-todo", progress: "bg-progress", done: "bg-done" };

function currentQuery(sp: SearchParamsRecord): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
  }
  return q.toString();
}

export default async function StatisticsPage({ searchParams }: PageProps<"/statistics">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const [stats, settings] = await Promise.all([
    svc.statistics(access, { spaces: spacesFilter(sp) }),
    svc.getSettings(access),
  ]);
  const query = currentQuery(sp);
  const sheetHref = (ref: string) => withParams(query, { task: ref }, "/statistics");
  const weekCreated = stats.weekly.reduce((n, w) => n + w.created, 0);
  const weekDone = stats.weekly.reduce((n, w) => n + w.completed, 0);
  const open = stats.total - stats.completion.done;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader className="pb-0" title="Statistics" description="Counts cover tasks that are not drafts and not archived." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tasks" value={stats.total} hint={`${open} open`} />
        <StatCard
          label="Complete"
          value={`${stats.completion.percent}%`}
          hint={
            <span className="flex flex-col gap-1.5">
              <ProgressBar value={stats.completion.done} max={stats.completion.total} tone="done" label="Completion" className="mt-1" />
              {stats.completion.done} of {stats.completion.total} in {settings.doneStatus}
            </span>
          }
        />
        <StatCard label="Waiting" value={stats.waiting.length} hint={`${pluralize(stats.waiting.length, "task")} labelled waiting`} />
        <StatCard label="Last 8 weeks" value={`${weekCreated} / ${weekDone}`} hint="created / completed" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="By status">
          <CountBars rows={stats.byStatus} tone={(name) => TONE_BAR[statusTone(name, settings.statuses)] ?? "bg-fg-subtle"} />
        </Panel>
        <Panel title="By type">
          <CountBars rows={stats.byType} />
        </Panel>
        <Panel title="By priority">
          <CountBars rows={stats.byPriority} />
        </Panel>
      </div>

      <Panel title="Created vs completed per week">
        <WeeklyChart weeks={stats.weekly} />
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Waiting">
          <TaskMiniList
            items={stats.waiting}
            hrefFor={sheetHref}
            statuses={settings.statuses}
            empty="Nothing is waiting. Add the waiting label to a task that is blocked on someone else."
          />
        </Panel>
        <Panel title="Oldest open">
          <TaskMiniList
            items={stats.oldestOpen}
            hrefFor={sheetHref}
            statuses={settings.statuses}
            empty="No open tasks."
            showAge
          />
        </Panel>
      </div>
      <TaskSheetSlot taskRef={param(sp, "task")} />
    </div>
  );
}
