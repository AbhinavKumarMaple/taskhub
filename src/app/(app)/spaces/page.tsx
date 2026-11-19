import type { Metadata } from "next";
import { SpacesView } from "@/components/content/spaces-view";
import { requireOwner } from "@/server/auth";
import { getSettings, listSpaces } from "@/server/service";

export const metadata: Metadata = { title: "Spaces" };

export default async function SpacesPage() {
  const access = await requireOwner();
  const [spaces, settings] = await Promise.all([listSpaces(access, { includeArchived: true }), getSettings(access)]);
  return <SpacesView spaces={spaces} statuses={settings.statuses} />;
}
