"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Select } from "@/components/ui/input";
import { maskSecret } from "@/lib/format";

type SpaceOption = { id: string; name: string; key: string };

function CodeBlock({ label, shown, copy }: { label: string; shown: string; copy: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
        <span className="text-[12px] font-medium text-fg-muted">{label}</span>
        <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} size="xs" />
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all text-fg">
        {shown}
      </pre>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** The interactive part of /connect: token reveal, Space picker, commands with the real values on copy. */
export function ConnectView({ origin, token, spaces }: { origin: string; token: string; spaces: SpaceOption[] }) {
  const [reveal, setReveal] = useState(false);
  const [spaceId, setSpaceId] = useState("");
  const space = spaces.find((s) => s.id === spaceId);
  const shownToken = reveal ? token : maskSecret(token);
  const shownKey = space ? (reveal ? space.key : maskSecret(space.key)) : "";
  const mcpUrl = `${origin}/api/mcp`;

  const claudeCmd = (t: string, k: string) =>
    `claude mcp add --transport http taskhub ${mcpUrl} --header "Authorization: Bearer ${t}"` +
    (k ? ` --header "X-Space-Key: ${k}"` : "");

  const jsonConfig = (t: string, k: string) =>
    JSON.stringify(
      {
        mcpServers: {
          taskhub: {
            type: "http",
            url: mcpUrl,
            headers: { Authorization: `Bearer ${t}`, ...(k ? { "X-Space-Key": k } : {}) },
          },
        },
      },
      null,
      2,
    );

  const keyHeader = (k: string) => ` \\\n  -H "X-Space-Key: ${k || "sk_…"}"`;
  const curl = (t: string, k: string) =>
    [
      `# Create a Space (the response holds its key)`,
      `curl -X POST ${origin}/api/v1/spaces \\\n  -H "Authorization: Bearer ${t}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"My project"}'`,
      ``,
      `# List open features`,
      `curl "${origin}/api/v1/tasks?type=feature&exclude_status=Done" \\\n  -H "Authorization: Bearer ${t}"${keyHeader(k)}`,
      ``,
      `# Create a task`,
      `curl -X POST ${origin}/api/v1/tasks \\\n  -H "Authorization: Bearer ${t}"${keyHeader(k)} \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Add login","type":"feature","acceptance_criteria":["Owner can sign in"]}'`,
      ``,
      `# The board as markdown`,
      `curl ${origin}/api/v1/board.md \\\n  -H "Authorization: Bearer ${t}"${keyHeader(k)}`,
    ].join("\n");

  const chatBrief = (t: string, k: string) =>
    [
      `Track your work in Taskhub over its REST API with curl.`,
      `First read the guide: curl -s ${origin}/api/v1 — then follow it.`,
      `Token: TASKHUB_TOKEN=${t}`,
      k
        ? `Space key: TASKHUB_KEY=${k}`
        : `No Space key yet: create a Space for this chat (POST /api/v1/spaces) and tell me its key.`,
    ].join("\n");

  return (
    <div className="space-y-4">
      <Section
        title="Give this to any chat"
        description="Paste it into a chat that can run curl. It reads the guide at /api/v1 and tracks its work from there; no setup on the chat's side."
      >
        <CodeBlock label="Message for the chat" shown={chatBrief(shownToken, shownKey)} copy={chatBrief(token, space?.key ?? "")} />
      </Section>

      <Section
        title="Credentials"
        description="Every chat uses the same agent token. What a chat can see is decided by the Space keys it passes."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Agent token" hint="Set as AGENT_TOKEN in the environment.">
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[12px]">
                {shownToken}
              </code>
              <IconButton
                label={reveal ? "Hide secrets" : "Reveal secrets"}
                variant="ghost"
                size="sm"
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
              >
                {reveal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              </IconButton>
              <CopyButton value={token} label="Copy agent token" />
            </div>
          </Field>
          <Field
            label="Fill in a Space key"
            hint={space ? `Commands below open "${space.name}" for the chat.` : "Optional. Without one, the chat passes space_key on each call."}
            htmlFor="connect-space"
          >
            <Select
              id="connect-space"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              placeholder="No Space key"
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Claude Code"
        description="Run once in a terminal. The chat can then call the Taskhub tools (start with instructions and space_info)."
      >
        <CodeBlock label="Command" shown={claudeCmd(shownToken, shownKey)} copy={claudeCmd(token, space?.key ?? "")} />
        <CodeBlock
          label="Other MCP clients (JSON config)"
          shown={jsonConfig(shownToken, shownKey)}
          copy={jsonConfig(token, space?.key ?? "")}
        />
      </Section>

      <Section
        title="How Spaces keep chats apart"
        description={
          <>
            A chat creates its own Space with <code className="font-mono">space_create</code> and keeps the key it gets
            back. It sees only Spaces whose key it passes (comma-separate several). To let a chat see another chat&apos;s
            tasks, give it that Space&apos;s key from the Spaces page. Regenerating a key cuts off every chat holding it.
          </>
        }
      >
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg-muted">
          <li>New chat: &ldquo;Create a Taskhub Space called <em>my project</em> and remember its key.&rdquo;</li>
          <li>Each call: the chat passes <code className="font-mono">space_key</code> (or the X-Space-Key header).</li>
          <li>Sharing: paste another Space&apos;s key into the chat; it can now see and update those tasks too.</li>
        </ol>
      </Section>

      <Section title="REST API" description={<>JSON over HTTP at <code className="font-mono">{origin}/api/v1</code>. Errors are {"{error:{code,message}}"}.</>}>
        <CodeBlock label="curl examples" shown={curl(shownToken, shownKey)} copy={curl(token, space?.key ?? "")} />
      </Section>
    </div>
  );
}
