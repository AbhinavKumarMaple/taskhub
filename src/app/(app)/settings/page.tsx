import type { Metadata } from "next";
import { SettingsView } from "@/components/content/settings-view";
import { requireOwner } from "@/server/auth";
import { getSettings } from "@/server/service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const access = await requireOwner();
  const settings = await getSettings(access);
  return <SettingsView key={settings.updatedAt.toISOString()} settings={settings} />;
}
