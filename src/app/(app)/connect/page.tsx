import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyButton } from "@/components/ui/copy-button";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/misc";
import { requireOwner } from "@/server/auth";
import { TRACKING_RULES } from "@/server/instructions";
import * as svc from "@/server/service";
import { authEnv } from "@/server/session";
import { ConnectView } from "./connect-view";

export const metadata: Metadata = { title: "Connect" };

async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ConnectPage() {
  const access = await requireOwner();
  const [origin, spaces] = await Promise.all([publicOrigin(), svc.listSpaces(access)]);
  const token = authEnv("AGENT_TOKEN");

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Connect"
        description="Give a chat access to Taskhub over MCP or the REST API, and paste the tracking rules into its instructions."
      />
      <div className="space-y-4">
        <ConnectView origin={origin} token={token} spaces={spaces.map((s) => ({ id: s.id, name: s.name, key: s.key }))} />

        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Tracking rules</h2>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                Paste into a global CLAUDE.md so every chat records work the same way. Chats can also read them with the{" "}
                <code className="font-mono">instructions</code> tool.
              </p>
            </div>
            <CopyButton value={TRACKING_RULES} label="Copy tracking rules" variant="outline">
              Copy rules
            </CopyButton>
          </div>
          <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-surface-2 px-4 py-3">
            <Markdown>{TRACKING_RULES}</Markdown>
          </div>
        </section>
      </div>
    </div>
  );
}
