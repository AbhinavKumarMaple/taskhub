import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentDetail } from "@/components/content/document-detail";
import { selectedSpace } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { isAppError } from "@/server/errors";
import { getDocument } from "@/server/service";

export async function generateMetadata({ params }: PageProps<"/documents/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  return { title: decodeURIComponent(ref).toUpperCase() };
}

export default async function DocumentDetailPage({ params, searchParams }: PageProps<"/documents/[ref]">) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const access = await requireOwner();
  const doc = await getDocument(access, decodeURIComponent(ref)).catch((e: unknown) => {
    if (isAppError(e) && (e.code === "not_found" || e.code === "invalid")) notFound();
    throw e;
  });
  return <DocumentDetail key={doc.ref} doc={doc} selectedSpace={selectedSpace(sp) ?? null} />;
}
