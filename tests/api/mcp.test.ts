import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setupTestDb } from "@/server/service/test-helpers";
import * as mcpRoute from "@/app/api/[transport]/route";

setupTestDb();

const URL_ = "http://localhost/api/mcp";
const params = { params: Promise.resolve({ transport: "mcp" }) };

/** fetch that routes straight into the Next route handler (no HTTP server). */
const inProcessFetch = async (input: string | URL | Request, init?: RequestInit) =>
  mcpRoute.POST(new Request(input, init), params);

const clients: Client[] = [];
afterEach(async () => {
  while (clients.length) await clients.pop()!.close();
});

async function connect(headers: Record<string, string> = {}) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    fetch: inProcessFetch,
    requestInit: { headers: { authorization: "Bearer dev-token", ...headers } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> };
async function tool(client: Client, name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}
const text = (r: ToolResult) => r.content.map((c) => c.text).join("\n");

describe("MCP endpoint", () => {
  it("rejects requests without the agent token", async () => {
    const res = await mcpRoute.POST(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      params,
    );
    expect(res.status).toBe(401);
    const other = await mcpRoute.POST(new Request("http://localhost/api/other", { method: "POST" }), {
      params: Promise.resolve({ transport: "other" }),
    });
    expect(other.status).toBe(404);
  });

  it("lists every SPEC tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [
      "instructions", "space_create", "space_info", "task_create", "task_list", "task_view", "task_edit",
      "task_move", "task_archive", "task_restore", "task_delete", "draft_create", "draft_promote", "task_demote",
      "task_comment", "search", "board", "milestone_create", "milestone_list", "milestone_edit", "doc_create",
      "doc_list", "doc_view", "doc_edit", "decision_create", "decision_list", "decision_view", "decision_edit",
      "activity", "statistics",
    ].sort();
    expect(names).toEqual(expected);
    const taskCreate = tools.find((t) => t.name === "task_create")!;
    expect(Object.keys(taskCreate.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["space_key", "actor", "title", "parent", "acceptance_criteria"]),
    );
    const spaceCreate = tools.find((t) => t.name === "space_create")!;
    expect(Object.keys(spaceCreate.inputSchema.properties ?? {})).not.toContain("space_key");
  });

  it("round trip: space, tasks, edits, board, docs, decisions, isolation", async () => {
    const client = await connect();

    expect(text(await tool(client, "instructions"))).toContain("Taskhub tracking rules");

    const created = await tool(client, "space_create", { name: "MCP chat", actor: "chat-one" });
    expect(created.isError).toBeFalsy();
    const key = (created.structuredContent as { key: string }).key;
    expect(text(created)).toContain(key);
    const other = (await tool(client, "space_create", { name: "MCP other" })).structuredContent as { key: string; id: string };

    const info = await tool(client, "space_info", { space_key: key });
    expect(text(info)).toContain("MCP chat");
    expect(text(info)).not.toContain("MCP other");

    const feat = await tool(client, "task_create", {
      space_key: key,
      actor: "chat-one",
      title: "Payment page",
      type: "feature",
      acceptance_criteria: ["Card form"],
      no_dod_defaults: true,
    });
    expect(feat.isError).toBeFalsy();
    const ref = (feat.structuredContent as { ref: string }).ref;
    expect(text(feat)).toContain(`Created ${ref}`);

    const sub = await tool(client, "task_create", { space_key: key, title: "Card form", parent: ref });
    expect((sub.structuredContent as { ref: string }).ref).toBe(`${ref}.1`);

    const edited = await tool(client, "task_edit", {
      space_key: key,
      ref,
      check_ac: [1],
      append_notes: "half way",
      add_labels: ["waiting"],
      due_date: "2031-05-01",
    });
    expect(edited.isError).toBeFalsy();
    expect(edited.structuredContent).toMatchObject({ acDone: 1, labels: ["waiting"], dueDate: "2031-05-01" });

    const moved = await tool(client, "task_move", { space_key: key, ref, status: "In Progress" });
    expect(text(moved)).toContain("[In Progress]");

    await tool(client, "task_comment", { space_key: key, ref, body: "Note from chat", actor: "chat-one" });
    const view = await tool(client, "task_view", { space_key: key, ref });
    expect(text(view)).toContain("1. [x] Card form");
    expect(text(view)).toContain("chat-one: Note from chat");
    expect(text(view)).toContain(`${ref}.1`);

    const list = await tool(client, "task_list", { space_key: key, labels: "waiting" });
    expect((list.structuredContent as { total: number }).total).toBe(1);

    const board = await tool(client, "board", { space_key: key, type: "feature" });
    expect(text(board)).toContain("## In Progress (1)");
    expect((board.structuredContent as { columns: { status: string }[] }).columns.map((c) => c.status)).toEqual([
      "To Do",
      "In Progress",
      "Done",
    ]);

    const search = await tool(client, "search", { space_key: key, q: "page payment" });
    expect(text(search)).toContain(ref);

    // drafts
    const draft = await tool(client, "draft_create", { space_key: key, title: "Maybe later" });
    const dref = (draft.structuredContent as { ref: string; isDraft: boolean }).ref;
    expect((draft.structuredContent as { isDraft: boolean }).isDraft).toBe(true);
    expect((await tool(client, "draft_promote", { space_key: key, ref: dref })).structuredContent).toMatchObject({ isDraft: false });
    expect((await tool(client, "task_demote", { space_key: key, ref: dref })).structuredContent).toMatchObject({ isDraft: true });

    // archive / restore / delete
    await tool(client, "task_archive", { space_key: key, ref: dref });
    expect((await tool(client, "task_restore", { space_key: key, ref: dref })).structuredContent).toMatchObject({ archivedAt: null });
    await tool(client, "task_archive", { space_key: key, ref: dref });
    expect(text(await tool(client, "task_delete", { space_key: key, ref: dref }))).toBe(`Deleted ${dref}`);

    // milestones, docs, decisions
    const ms = await tool(client, "milestone_create", { space_key: key, title: "Launch" });
    const mref = (ms.structuredContent as { ref: string }).ref;
    await tool(client, "task_edit", { space_key: key, ref, milestone: mref });
    expect(text(await tool(client, "milestone_list", { space_key: key }))).toContain("0/1 done");
    expect((await tool(client, "milestone_edit", { space_key: key, ref: mref, archived: true })).structuredContent).toHaveProperty("archivedAt");

    const doc = await tool(client, "doc_create", { space_key: key, title: "Design notes", body: "Hello **world**" });
    const docRef = (doc.structuredContent as { ref: string }).ref;
    expect(text(await tool(client, "doc_view", { space_key: key, ref: docRef }))).toContain("Hello **world**");
    await tool(client, "doc_edit", { space_key: key, ref: docRef, body: "Replaced" });
    expect(text(await tool(client, "doc_list", { space_key: key }))).toContain("Design notes");

    const dec = await tool(client, "decision_create", { space_key: key, title: "Use cards", context: "Because" });
    const decRef = (dec.structuredContent as { ref: string }).ref;
    await tool(client, "decision_edit", { space_key: key, ref: decRef, status: "accepted" });
    expect(text(await tool(client, "decision_view", { space_key: key, ref: decRef }))).toContain("[accepted]");
    expect(text(await tool(client, "decision_list", { space_key: key, status: "accepted" }))).toContain(decRef);

    const act = await tool(client, "activity", { space_key: key, by: "chat-one" });
    expect(text(act)).toContain("chat-one");
    const stats = await tool(client, "statistics", { space_key: key });
    expect(text(stats)).toMatch(/tasks · \d+% complete/);

    // isolation: other key, and no key
    const otherView = await tool(client, "task_view", { space_key: other.key, ref });
    expect(otherView.isError).toBe(true);
    expect(text(otherView)).toMatch(/^not_found/);
    expect((await tool(client, "task_edit", { space_key: other.key, ref, title: "x" })).isError).toBe(true);
    expect(text(await tool(client, "search", { space_key: other.key, q: "payment" }))).toBe("No matches.");
    expect(text(await tool(client, "board", { space_key: other.key }))).not.toContain(ref);
    expect(text(await tool(client, "activity", { space_key: other.key }))).not.toContain("Payment");
    expect((await tool(client, "task_view", { ref })).isError).toBe(true);

    // both keys (comma-separated) open both Spaces
    const both = await tool(client, "space_info", { space_key: `${key},${other.key}` });
    expect(text(both)).toContain("MCP other");

    // invalid input is a tool error, not a crash
    const bad = await tool(client, "task_create", { space_key: key, title: "" });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/^invalid/);
  });

  it("takes Space keys from the X-Space-Key header", async () => {
    const setup = await connect();
    const s = (await tool(setup, "space_create", { name: "Header space" })).structuredContent as { key: string };
    const client = await connect({ "x-space-key": s.key, "x-actor": "header-chat" });
    const t = await tool(client, "task_create", { title: "From header" });
    expect(t.isError).toBeFalsy();
    const view = await tool(client, "task_view", { ref: (t.structuredContent as { ref: string }).ref });
    expect((view.structuredContent as { activity: { actor: string }[] }).activity[0].actor).toBe("header-chat");
  });
});
