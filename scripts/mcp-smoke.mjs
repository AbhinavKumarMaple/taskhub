#!/usr/bin/env node
/**
 * MCP smoke test against a running Taskhub: lists tools, creates a Space and a task with acceptance
 * criteria, checks one, reads the board, searches, and proves a second Space's key cannot see the task.
 *
 *   npm run smoke:mcp                                   # http://localhost:3100/api/mcp, token dev-token
 *   TASKHUB_URL=https://host/api/mcp AGENT_TOKEN=... npm run smoke:mcp
 *
 * Creates two Spaces named "MCP smoke …" each run; archive them from the Spaces page afterwards.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.TASKHUB_URL ?? "http://localhost:3100/api/mcp";
const TOKEN = process.env.AGENT_TOKEN ?? "dev-token";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

async function connect(headers = {}) {
  const client = new Client({ name: "taskhub-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}`, ...headers } },
  });
  await client.connect(transport);
  return client;
}

const text = (r) => (r.content ?? []).map((c) => c.text ?? "").join("\n");
async function call(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  return { ...r, text: text(r), data: r.structuredContent };
}

async function main() {
  // 0. Wrong token is refused before any MCP traffic.
  try {
    const bad = new Client({ name: "taskhub-smoke", version: "1.0.0" });
    await bad.connect(
      new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { authorization: "Bearer wrong" } } }),
    );
    check("wrong token rejected", false, "connected with a wrong token");
  } catch (e) {
    check("wrong token rejected", /401|unauthor/i.test(String(e?.message ?? e)), String(e?.message ?? e).slice(0, 80));
  }

  const chat = await connect({ "x-actor": "smoke-chat" });

  // 1. Tools.
  const { tools } = await chat.listTools();
  const names = tools.map((t) => t.name);
  check("tools/list", names.length >= 30, `${names.length} tools`);
  for (const n of ["instructions", "space_create", "task_create", "task_edit", "board", "search"])
    check(`tool ${n} present`, names.includes(n));

  // 2. Two Spaces, each with its own key.
  const stamp = Date.now().toString(36);
  const a = await call(chat, "space_create", { name: `MCP smoke A ${stamp}`, color: "purple" });
  const b = await call(chat, "space_create", { name: `MCP smoke B ${stamp}` });
  const keyA = a.data?.key;
  const keyB = b.data?.key;
  check("space_create returns a key", /^sk_/.test(keyA ?? "") && /^sk_/.test(keyB ?? ""), keyA ? `${keyA.slice(0, 5)}…` : a.text);

  // 3. Task with acceptance criteria, then check one.
  const created = await call(chat, "task_create", {
    space_key: keyA,
    title: `Smoke feature ${stamp}`,
    type: "feature",
    priority: "High",
    acceptance_criteria: ["Endpoint answers", "Board shows it"],
  });
  const ref = created.data?.ref;
  check("task_create", !created.isError && !!ref, created.text.split("\n")[0]);

  const edited = await call(chat, "task_edit", { space_key: keyA, ref, check_ac: [1], append_notes: "Checked by the smoke test." });
  const ac = edited.data?.acceptanceCriteria ?? edited.data?.ac ?? [];
  check("task_edit check_ac", !edited.isError && ac[0]?.checked === true && ac[1]?.checked === false, `AC ${ac.filter((x) => x.checked).length}/${ac.length}`);

  const board = await call(chat, "board", { space_key: keyA });
  check("board lists the task", !board.isError && board.text.includes(ref), board.text.split("\n").slice(0, 3).join(" | "));

  // Word order must not matter.
  const found = await call(chat, "search", { space_key: keyA, q: `${stamp} smoke` });
  check("search (reversed words)", !found.isError && found.text.includes(ref), found.text.split("\n")[0]);

  // 4. Isolation: key B cannot see Space A's task.
  const viewB = await call(chat, "task_view", { space_key: keyB, ref });
  check("key B: task_view is not_found", !!viewB.isError && /not.?found/i.test(viewB.text), viewB.text.slice(0, 80));
  const searchB = await call(chat, "search", { space_key: keyB, q: `${stamp} smoke` });
  check("key B: search finds nothing", !searchB.isError && !searchB.text.includes(ref));
  const listB = await call(chat, "task_list", { space_key: keyB });
  check("key B: task_list is empty", !listB.isError && !listB.text.includes(ref));
  const editB = await call(chat, "task_edit", { space_key: keyB, ref, title: "hijacked" });
  check("key B: task_edit is not_found", !!editB.isError);
  const noKey = await call(chat, "task_view", { ref });
  check("no key: task_view is not_found", !!noKey.isError);

  // 5. Sharing: a chat given both keys (header) sees it.
  const shared = await connect({ "x-space-key": `${keyB},${keyA}` });
  const viewShared = await call(shared, "task_view", { ref });
  check("both keys via X-Space-Key: task_view works", !viewShared.isError && viewShared.text.includes(ref));

  await chat.close();
  await shared.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll MCP checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
