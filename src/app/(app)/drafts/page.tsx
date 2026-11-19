import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { DraftsList } from "@/components/lists/drafts-list";
import { NewDraftButton } from "@/components/lists/new-draft-button";
import { TaskSheetSlot } from "@/components/lists/task-sheet-slot";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { param, spacesFilter } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import * as svc from "@/server/service";

export const metadata: Metadata = { title: "Drafts" };

export default async function DraftsPage({ searchParams }: PageProps<"/drafts">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const list = await svc.listTasks(access, {
    spaces: spacesFilter(sp),
    drafts: "only",
    sort: "updated",
    order: "desc",
    limit: 1000,
  });

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Drafts"
        description="Ideas that are not on the board yet. Promote one when it is ready to work on."
        actions={<NewDraftButton />}
      />
      {list.items.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="No drafts"
          description="Write down an idea as a draft so it stays off the board until you promote it."
          action={<NewDraftButton variant="secondary" />}
        />
      ) : (
        <DraftsList items={list.items} />
      )}
      <TaskSheetSlot taskRef={param(sp, "task")} />
    </div>
  );
}
