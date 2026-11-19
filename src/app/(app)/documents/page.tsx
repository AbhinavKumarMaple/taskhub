import type { Metadata } from "next";
import { DocumentsView } from "@/components/content/documents-view";
import { param, selectedSpace } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { listDocuments, listSpaceRefs } from "@/server/service";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const sp = await searchParams;
  const access = await requireOwner();
  const space = selectedSpace(sp);
  const archived = param(sp, "archived") === "1";
  const q = param(sp, "q");
  const [documents, spaces] = await Promise.all([
    listDocuments(access, { spaces: space ? [space] : undefined, q, archivedOnly: archived }),
    listSpaceRefs(access),
  ]);
  return (
    <DocumentsView
      documents={documents}
      spaces={spaces.filter((s) => !s.archived)}
      selectedSpace={space ?? null}
      archived={archived}
      filtered={!!q}
    />
  );
}
