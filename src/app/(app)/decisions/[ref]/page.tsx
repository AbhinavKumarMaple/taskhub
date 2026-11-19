import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DecisionDetail } from "@/components/content/decision-detail";
import { selectedSpace } from "@/lib/nav";
import { requireOwner } from "@/server/auth";
import { isAppError } from "@/server/errors";
import { getDecision } from "@/server/service";

export async function generateMetadata({ params }: PageProps<"/decisions/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  return { title: decodeURIComponent(ref).toUpperCase() };
}

export default async function DecisionDetailPage({ params, searchParams }: PageProps<"/decisions/[ref]">) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const access = await requireOwner();
  const decision = await getDecision(access, decodeURIComponent(ref)).catch((e: unknown) => {
    if (isAppError(e) && (e.code === "not_found" || e.code === "invalid")) notFound();
    throw e;
  });
  return <DecisionDetail key={decision.ref} decision={decision} selectedSpace={selectedSpace(sp) ?? null} />;
}
