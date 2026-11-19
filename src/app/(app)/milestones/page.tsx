import type { Metadata } from "next";
import { MilestonesView } from "@/components/content/milestones-view";
import { param, selectedSpace } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { listMilestones, listSpaceRefs } from "@/server/service";

export const metadata: Metadata = { title: "Milestones" };

export default async function MilestonesPage({ searchParams }: PageProps<"/milestones">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const space = selectedSpace(sp);
  const archived = param(sp, "archived") === "1";
  const q = param(sp, "q");
  const [milestones, spaces] = await Promise.all([
    listMilestones(access, { spaces: space ? [space] : undefined, q, archivedOnly: archived }),
    listSpaceRefs(access),
  ]);
  return (
    <MilestonesView
      milestones={milestones}
      spaces={spaces.filter((s) => !s.archived)}
      selectedSpace={space ?? null}
      archived={archived}
      filtered={!!q}
    />
  );
}
