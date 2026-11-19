import type { Metadata } from "next";
import { DecisionsView } from "@/components/content/decisions-view";
import { param, selectedSpace } from "@/lib/nav";
import { DECISION_STATUSES, type DecisionStatus } from "@/lib/types";
import { requireOwner } from "@/server/auth";
import { listDecisions, listSpaceRefs } from "@/server/service";

export const metadata: Metadata = { title: "Decisions" };

export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const space = selectedSpace(sp);
  const archived = param(sp, "archived") === "1";
  const q = param(sp, "q");
  const s = param(sp, "status");
  const status = DECISION_STATUSES.includes(s as DecisionStatus) ? (s as DecisionStatus) : undefined;
  const [all, spaces] = await Promise.all([
    listDecisions(access, { spaces: space ? [space] : undefined, q, archivedOnly: archived }),
    listSpaceRefs(access),
  ]);
  const counts = Object.fromEntries(DECISION_STATUSES.map((x) => [x, all.filter((d) => d.status === x).length]));
  return (
    <DecisionsView
      decisions={status ? all.filter((d) => d.status === status) : all}
      total={all.length}
      counts={counts as Record<DecisionStatus, number>}
      status={status ?? null}
      spaces={spaces.filter((x) => !x.archived)}
      selectedSpace={space ?? null}
      archived={archived}
      filtered={!!q || !!status}
    />
  );
}
