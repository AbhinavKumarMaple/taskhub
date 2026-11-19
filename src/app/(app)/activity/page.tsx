import type { Metadata } from "next";
import { ActivityTimeline } from "@/components/lists/activity-timeline";
import { PageHeader } from "@/components/ui/misc";
import { param, selectedSpace } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import * as svc from "@/server/service";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const spaceId = selectedSpace(sp);
  const actor = param(sp, "actor");

  const [page, spaceRefs, actors] = await Promise.all([
    svc.listActivity(access, { spaceId, actor, limit: 50 }),
    svc.listSpaceRefs(access),
    svc.listActors(access),
  ]);
  const spaces = spaceRefs.map(({ id, name, color }) => ({ id, name, color }));

  return (
    <div className="flex flex-col">
      <PageHeader title="Activity" description="Every change, newest first, from you and from connected chats." />
      <ActivityTimeline
        initial={page.items}
        nextBefore={page.nextBefore}
        spaces={spaces}
        actors={actor && !actors.includes(actor) ? [...actors, actor] : actors}
        spaceId={spaceId}
        actor={actor}
      />
    </div>
  );
}
