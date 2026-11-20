import { Suspense } from "react";
import { requireOwner } from "@/server/auth";
import { getNavCounts, getSettings, listSpaceRefs } from "@/server/service";
import { AppShell } from "@/components/shell/app-shell";
import { PageSkeleton, SidebarSkeleton } from "@/components/shell/skeletons";
import { Sidebar } from "@/components/shell/sidebar";
import type { NavCounts } from "@/lib/types";

/** Reads the session + counts; streams in behind its own Suspense boundary. */
async function SidebarLoader() {
  const access = await requireOwner();
  const spaces = (await listSpaceRefs(access)).filter((s) => !s.archived);
  const [settings, ...entries] = await Promise.all([
    getSettings(access),
    getNavCounts(access).then((c) => ["all", c] as const),
    ...spaces.map((s) => getNavCounts(access, { spaces: [s.id] }).then((c) => [s.id, c] as const)),
  ]);
  return (
    <Sidebar spaces={spaces} counts={Object.fromEntries(entries) as Record<string, NavCounts>} stopped={settings.stoppedStatuses} />
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarLoader />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </AppShell>
  );
}
