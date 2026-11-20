/**
 * Every MCP tool from the SPEC. Each one is a thin call into the service layer:
 * snake_case arguments → camelCase service input; result = concise text + structured JSON.
 */
import { z } from "zod";
import type { createMcpHandler } from "mcp-handler";
import { SPACE_COLORS, type Access, type TaskFull } from "@/lib/types";
import { errorBody } from "@/server/errors";
import { getInstructions } from "@/server/instructions";
import * as svc from "@/server/service";
import * as fmt from "./format";

export type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];
/** Resolves the caller's Access from the request plus a tool's `space_key` / `actor` arguments. */
export type GetAccess = (spaceKey: string | undefined, actor: string | undefined) => Promise<Access>;

type Out = { text: string; data: unknown };
type Args = Record<string, unknown>;

// ── Argument fragments ───────────────────────────────────────────────────────
const spaceKeyArg = z
  .string()
  .optional()
  .describe("Space key(s) (sk_…), comma-separated for several. Required unless sent as the X-Space-Key header.");
const actorArg = z.string().max(100).optional().describe('Your name in the activity log (default "chat").');
const ref = z.string().describe("Task ref, e.g. T-12 or T-12.3");
const strOrList = z.union([z.string(), z.array(z.string())]);
const strs = z.array(z.string());
const idxs = z.array(z.number().int().min(1)).describe("1-based item numbers as shown by task_view");
const editItems = z.array(z.object({ index: z.number().int().min(1), text: z.string() }));
const spaceIdArg = z.string().optional().describe("Space id (sp_…). Needed only when your keys open several Spaces.");
const date = z.string().nullable().describe("YYYY-MM-DD, or null to clear");

const taskFields = {
  title: z.string().optional(),
  description: z.string().optional().describe("Markdown"),
  status: z.string().optional().describe("To Do | In Progress | Blocked | Done | Cancelled (see space_info)"),
  reason: z
    .string()
    .optional()
    .describe("Why: required when moving to Blocked or Cancelled (what stopped it / why dropped); kept in the status history"),
  type: z.string().optional().describe("feature | sub-feature | fix | minor (see space_info)"),
  priority: z.string().nullable().optional(),
  labels: strs.optional().describe("Replaces all labels"),
  assignees: strs.optional(),
  milestone: z.string().nullable().optional().describe("Milestone ref (M-3), or null"),
  due_date: date.optional(),
  plan: z.string().optional(),
  notes: z.string().optional(),
  final_summary: z.string().optional(),
  references: strs.optional(),
  documentation: strs.optional(),
  modified_files: strs.optional(),
  deployable: z
    .boolean()
    .optional()
    .describe("Ships code: track its deploys per environment (Development, Production). Plain tasks leave it false"),
};

const createFields = {
  ...taskFields,
  title: z.string().describe("Short title"),
  parent: z.string().optional().describe("Parent task ref: makes this a child (T-12.1) in the parent's Space"),
  space_id: spaceIdArg,
  acceptance_criteria: strs.optional(),
  definition_of_done: strs.optional(),
  no_dod_defaults: z.boolean().optional().describe("Skip the configured Definition-of-Done defaults"),
  depends_on: strs.optional().describe("Refs this task waits on (same Space)"),
};

const editFields = {
  ref,
  ...taskFields,
  space_id: z.string().optional().describe("Move a top-level task (and its children) to another Space you hold"),
  parent: z
    .string()
    .nullable()
    .optional()
    .describe("New parent ref in the same Space, or null for top level. The task (and its subtasks) get new refs"),
  add_ac: strs.optional(),
  check_ac: idxs.optional(),
  uncheck_ac: idxs.optional(),
  remove_ac: idxs.optional(),
  edit_ac: editItems.optional(),
  set_ac: strs.optional().describe("Replace the list; identical texts keep their check"),
  reorder_ac: idxs.optional().describe("New order as a permutation of current item numbers"),
  add_dod: strs.optional(),
  check_dod: idxs.optional(),
  uncheck_dod: idxs.optional(),
  remove_dod: idxs.optional(),
  edit_dod: editItems.optional(),
  set_dod: strs.optional(),
  reorder_dod: idxs.optional(),
  append_notes: z.string().optional(),
  append_plan: z.string().optional(),
  add_labels: strs.optional(),
  remove_labels: strs.optional(),
  add_deps: strs.optional(),
  remove_deps: strs.optional(),
};

const listFields = {
  space_id: z.string().optional().describe("Only this Space (id)"),
  status: strOrList.optional(),
  exclude_status: strOrList.optional(),
  type: strOrList.optional(),
  labels: strOrList.optional().describe("All of these labels"),
  priority: strOrList.optional(),
  assignee: z.string().optional(),
  milestone: z.string().optional().describe('Milestone ref, or "none"'),
  parent: z.string().optional().describe("Children of this ref"),
  top_level_only: z.boolean().optional(),
  deployable: z.boolean().optional().describe("true: only tasks that ship code; false: only plain tasks"),
  deployed_to: strOrList.optional().describe("Deployed to all of these environments"),
  not_deployed_to: z.string().optional().describe("Ships code but not yet deployed to this environment"),
  q: z.string().optional().describe("Every word must match, any order"),
  include_archived: z.boolean().optional(),
  archived_only: z.boolean().optional(),
  drafts: z.enum(["exclude", "include", "only"]).optional(),
  sort: z
    .enum(["ordinal", "ref", "title", "status", "type", "priority", "space", "milestone", "ac", "created", "updated"])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
};

const entityListFields = {
  space_id: z.string().optional(),
  q: z.string().optional(),
  include_archived: z.boolean().optional(),
  archived_only: z.boolean().optional(),
};
const archivedArg = z.boolean().optional().describe("true archives it, false restores it");

// ── Helpers ──────────────────────────────────────────────────────────────────
const camelKey = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Drop transport args and undefined values; snake_case → camelCase. */
function toInput(args: Args, rename: Record<string, string> = {}): Args {
  const out: Args = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "space_key" || k === "actor" || v === undefined) continue;
    out[rename[k] ?? camelKey(k)] = v;
  }
  return out;
}

const spaceList = (id: unknown) => (typeof id === "string" && id ? [id] : undefined);
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

function ok({ text, data }: Out) {
  const structured = json(data);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent:
      structured && typeof structured === "object" && !Array.isArray(structured) ? structured : { items: structured },
  };
}

function fail(err: unknown) {
  const { body } = errorBody(err);
  return { isError: true, content: [{ type: "text" as const, text: `${body.error.code}: ${body.error.message}` }] };
}

// ── Registration ─────────────────────────────────────────────────────────────
export function registerTools(server: McpServer, getAccess: GetAccess) {
  function tool(
    name: string,
    description: string,
    shape: z.ZodRawShape,
    run: (args: Args, access: Access) => Promise<Out>,
    opts: { scoped?: boolean; readOnly?: boolean; destructive?: boolean } = {},
  ) {
    const scoped = opts.scoped ?? true;
    const inputSchema = z.object({ ...(scoped ? { space_key: spaceKeyArg } : {}), actor: actorArg, ...shape });
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: { readOnlyHint: !!opts.readOnly, destructiveHint: !!opts.destructive },
      },
      async (args: Args) => {
        try {
          const access = await getAccess(scoped ? (args.space_key as string | undefined) : undefined, args.actor as string | undefined);
          return ok(await run(args, access));
        } catch (err) {
          return fail(err);
        }
      },
    );
  }

  const taskOut = async (verb: string, t: TaskFull): Promise<Out> => ({
    text: `${verb} ${fmt.taskLine(t)}`,
    data: t,
  });

  // ── General ────────────────────────────────────────────────────────────────
  tool(
    "instructions",
    "The tracking rules: how to record work in Taskhub (item kinds, search first, statuses, waiting, done). Read once per chat.",
    {},
    async () => ({ text: getInstructions(), data: { instructions: getInstructions() } }),
    { scoped: false, readOnly: true },
  );

  tool(
    "space_create",
    "Create a Space (a board for one chat or project). Returns its key: pass it as space_key on every later call. Give the key to another chat to share the Space.",
    {
      name: z.string().describe("Unique name"),
      description: z.string().optional(),
      color: z.enum(SPACE_COLORS).optional(),
    },
    async (args, access) => {
      const s = await svc.createSpace(access, toInput(args) as Parameters<typeof svc.createSpace>[1]);
      return {
        text: `Created Space "${s.name}" (${s.id}).\nKey: ${s.key}\nPass this key as space_key on every call. Keep it: it is the only way back into this Space.`,
        data: s,
      };
    },
    { scoped: false },
  );

  tool(
    "space_info",
    "The Spaces your keys open (ids, task counts) plus the configured statuses, types, priorities and labels.",
    {},
    async (_args, access) => {
      const [spaces, settings] = await Promise.all([svc.listSpaces(access), svc.getSettings(access)]);
      return { text: fmt.spaceInfoText(spaces, settings), data: { spaces, settings } };
    },
    { readOnly: true },
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tool(
    "task_create",
    "Create a task. New work is a feature; parts of it are sub-features (parent = the feature ref); bugs are fixes. Search first to avoid duplicates.",
    createFields,
    async (args, access) =>
      taskOut("Created", await svc.createTask(access, toInput(args) as Parameters<typeof svc.createTask>[1])),
  );

  tool(
    "draft_create",
    "Create a draft (an idea not yet on the board). Promote it later with draft_promote.",
    createFields,
    async (args, access) =>
      taskOut(
        "Created draft",
        await svc.createTask(access, { ...toInput(args), isDraft: true } as Parameters<typeof svc.createTask>[1]),
      ),
  );

  tool(
    "task_list",
    "List tasks with filters. Excludes drafts and archived tasks unless asked.",
    listFields,
    async (args, access) => {
      const input = toInput(args, { space_id: "spaces" });
      const r = await svc.listTasks(access, input as Parameters<typeof svc.listTasks>[1]);
      return { text: fmt.taskListText(r.items, r.total), data: r };
    },
    { readOnly: true },
  );

  tool(
    "task_view",
    "Everything about one task: fields, acceptance criteria and DoD (numbered), sub-tasks, dependencies, comments.",
    { ref },
    async (args, access) => {
      const t = await svc.getTask(access, String(args.ref));
      return { text: fmt.taskDetail(t), data: t };
    },
    { readOnly: true },
  );

  tool(
    "task_edit",
    "Change any field of a task and/or apply list ops: add_ac / check_ac / uncheck_ac / remove_ac / edit_ac / set_ac / reorder_ac (same for _dod; item numbers are 1-based), append_notes, append_plan, add_labels, remove_labels, add_deps, remove_deps.",
    editFields,
    async (args, access) => {
      const { ref: r, ...rest } = args;
      return taskOut(
        "Updated",
        await svc.updateTask(access, String(r), toInput(rest) as Parameters<typeof svc.updateTask>[2]),
      );
    },
  );

  tool(
    "task_move",
    "Move a task to a status and/or position (before_ref / after_ref, or the end of the column).",
    {
      ref,
      status: z.string().optional(),
      reason: z.string().optional().describe("Required when moving to Blocked or Cancelled"),
      before_ref: z.string().optional().describe("Place directly above this task"),
      after_ref: z.string().optional().describe("Place directly below this task"),
      ordinal: z.number().optional(),
    },
    async (args, access) => {
      const t = await svc.moveTask(access, toInput(args) as Parameters<typeof svc.moveTask>[1]);
      return { text: `Moved ${fmt.taskLine(t)}`, data: t };
    },
  );

  tool("task_archive", "Archive a task (and its sub-tasks).", { ref }, async (args, access) =>
    taskOut("Archived", await svc.archiveTask(access, String(args.ref))),
  );
  tool("task_restore", "Restore an archived task (and the sub-tasks archived with it).", { ref }, async (args, access) =>
    taskOut("Restored", await svc.restoreTask(access, String(args.ref))),
  );
  tool(
    "task_delete",
    "Delete an archived task forever. Archive it first; delete its sub-tasks first.",
    { ref },
    async (args, access) => {
      const r = await svc.deleteTask(access, String(args.ref));
      return { text: `Deleted ${r.ref}`, data: r };
    },
    { destructive: true },
  );
  tool("draft_promote", "Turn a draft into a task on the board.", { ref }, async (args, access) =>
    taskOut("Promoted", await svc.promoteDraft(access, String(args.ref))),
  );
  tool("task_demote", "Turn a task back into a draft.", { ref }, async (args, access) =>
    taskOut("Demoted", await svc.demoteTask(access, String(args.ref))),
  );
  tool(
    "task_comment",
    "Add a comment to a task.",
    { ref, body: z.string().describe("Markdown") },
    async (args, access) => {
      const c = await svc.addComment(access, String(args.ref), { body: String(args.body) });
      return { text: `Commented on ${String(args.ref).toUpperCase()}`, data: c };
    },
  );

  const deployArgs = {
    environment: z.string().describe("Development | Production (see space_info)"),
    version: z.string().optional().describe("Commit, tag or build id"),
    url: z.string().optional().describe("Deploy or preview link (http/https)"),
    note: z.string().optional(),
  };
  tool(
    "task_deploy",
    "Record that a deploy shipped tasks to an environment (one push often ships several: pass them all). Marks each one as shipping code and adds a step to its deploy history. include_children also marks every sub-task of the refs.",
    { refs: strs.describe("Task refs this deploy shipped"), include_children: z.boolean().optional(), ...deployArgs },
    async (args, access) => {
      const items = await svc.recordDeployment(access, toInput(args) as Parameters<typeof svc.recordDeployment>[1]);
      return {
        text: `Deployed to ${String(args.environment)}:\n${items.map((t) => fmt.taskLine(t)).join("\n")}`,
        data: { items },
      };
    },
  );
  tool(
    "task_rollback",
    "Take a task's deploy off an environment (rolled back, or it never really shipped). Kept in its deploy history.",
    { ref, environment: deployArgs.environment, note: z.string().optional().describe("Why") },
    async (args, access) =>
      taskOut(
        "Rolled back",
        await svc.rollbackDeployment(access, String(args.ref), {
          environment: String(args.environment),
          note: args.note as string | undefined,
        }),
      ),
  );
  tool(
    "deployments",
    "Recent deploys and roll-backs across your Spaces, newest first.",
    { space_id: z.string().optional(), environment: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async (args, access) => {
      const items = await svc.listDeployments(access, {
        spaces: spaceList(args.space_id),
        environment: args.environment as string | undefined,
        limit: args.limit as number | undefined,
      });
      return { text: fmt.deploymentLogText(items), data: { items } };
    },
    { readOnly: true },
  );

  tool(
    "search",
    "Search tasks, documents and decisions. Every word must match, in any order. Use it before creating anything.",
    {
      q: z.string(),
      types: z.array(z.enum(["task", "document", "decision"])).optional(),
      space_id: z.string().optional(),
      include_archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async (args, access) => {
      const r = await svc.search(access, String(args.q), {
        types: args.types as ("task" | "document" | "decision")[] | undefined,
        spaces: spaceList(args.space_id),
        includeArchived: args.include_archived as boolean | undefined,
        limit: args.limit as number | undefined,
      });
      return { text: fmt.searchText(r), data: { results: r } };
    },
    { readOnly: true },
  );

  tool(
    "board",
    'The board: one column per status with its cards. type: "feature" gives the main board.',
    {
      space_id: z.string().optional(),
      type: strOrList.optional(),
      labels: strOrList.optional(),
      priority: strOrList.optional(),
      assignee: z.string().optional(),
      milestone: z.string().optional(),
      q: z.string().optional(),
    },
    async (args, access) => {
      const input = toInput(args, { space_id: "spaces" });
      const [settings, r] = await Promise.all([
        svc.getSettings(access),
        svc.listTasks(access, { ...input, limit: 1000 } as Parameters<typeof svc.listTasks>[1]),
      ]);
      const columns = settings.statuses.map((status) => ({
        status,
        tasks: r.items.filter((t) => t.status === status),
      }));
      return { text: fmt.boardText(settings.statuses, r.items), data: { columns } };
    },
    { readOnly: true },
  );

  // ── Milestones ─────────────────────────────────────────────────────────────
  tool(
    "milestone_create",
    "Create a milestone (M-3). Put tasks in it with task_edit milestone.",
    { title: z.string(), description: z.string().optional(), due_date: date.optional(), space_id: spaceIdArg },
    async (args, access) => {
      const m = await svc.createMilestone(access, toInput(args) as Parameters<typeof svc.createMilestone>[1]);
      return { text: `Created ${fmt.milestoneLine(m)}`, data: m };
    },
  );
  tool(
    "milestone_list",
    "Milestones with progress.",
    entityListFields,
    async (args, access) => {
      const items = await svc.listMilestones(access, toInput(args, { space_id: "spaces" }));
      return { text: items.length ? items.map(fmt.milestoneLine).join("\n") : "No milestones.", data: { items } };
    },
    { readOnly: true },
  );
  tool(
    "milestone_edit",
    "Change a milestone, or archive/restore it.",
    {
      ref: z.string().describe("M-3"),
      title: z.string().optional(),
      description: z.string().optional(),
      due_date: date.optional(),
      archived: archivedArg,
    },
    async (args, access) => {
      const { ref: r, archived, ...rest } = args;
      const fields = toInput(rest);
      let m = Object.keys(fields).length ? await svc.updateMilestone(access, String(r), fields as Parameters<typeof svc.updateMilestone>[2]) : await svc.getMilestone(access, String(r));
      if (archived === true) m = await svc.archiveMilestone(access, String(r));
      if (archived === false) m = await svc.restoreMilestone(access, String(r));
      return { text: `Updated ${fmt.milestoneLine(m)}`, data: m };
    },
  );

  // ── Documents ──────────────────────────────────────────────────────────────
  tool(
    "doc_create",
    "Create a markdown document (DOC-3) for longer write-ups.",
    { title: z.string(), body: z.string().optional().describe("Markdown"), space_id: spaceIdArg },
    async (args, access) => {
      const d = await svc.createDocument(access, toInput(args) as Parameters<typeof svc.createDocument>[1]);
      return { text: `Created ${fmt.docLine(d)}`, data: d };
    },
  );
  tool(
    "doc_list",
    "Documents (titles only).",
    entityListFields,
    async (args, access) => {
      const items = await svc.listDocuments(access, toInput(args, { space_id: "spaces" }));
      return { text: items.length ? items.map(fmt.docLine).join("\n") : "No documents.", data: { items } };
    },
    { readOnly: true },
  );
  tool(
    "doc_view",
    "One document with its body.",
    { ref: z.string().describe("DOC-3") },
    async (args, access) => {
      const d = await svc.getDocument(access, String(args.ref));
      return { text: fmt.docText(d), data: d };
    },
    { readOnly: true },
  );
  tool(
    "doc_edit",
    "Change a document's title or body (body replaces the whole text), or archive/restore it.",
    { ref: z.string().describe("DOC-3"), title: z.string().optional(), body: z.string().optional(), archived: archivedArg },
    async (args, access) => {
      const { ref: r, archived, ...rest } = args;
      const fields = toInput(rest);
      let d = Object.keys(fields).length ? await svc.updateDocument(access, String(r), fields as Parameters<typeof svc.updateDocument>[2]) : await svc.getDocument(access, String(r));
      if (archived === true) d = await svc.archiveDocument(access, String(r));
      if (archived === false) d = await svc.restoreDocument(access, String(r));
      return { text: `Updated ${fmt.docLine(d)}`, data: d };
    },
  );

  // ── Decisions ──────────────────────────────────────────────────────────────
  const decisionStatus = z.enum(["proposed", "accepted", "rejected", "superseded"]);
  tool(
    "decision_create",
    "Record a decision (DEC-3), ADR style: context, decision, consequences.",
    {
      title: z.string(),
      status: decisionStatus.optional(),
      context: z.string().optional(),
      decision: z.string().optional(),
      consequences: z.string().optional(),
      space_id: spaceIdArg,
    },
    async (args, access) => {
      const d = await svc.createDecision(access, toInput(args) as Parameters<typeof svc.createDecision>[1]);
      return { text: `Created ${fmt.decisionLine(d)}`, data: d };
    },
  );
  tool(
    "decision_list",
    "Decisions with their status.",
    { ...entityListFields, status: decisionStatus.optional() },
    async (args, access) => {
      const items = await svc.listDecisions(access, toInput(args, { space_id: "spaces" }));
      return { text: items.length ? items.map(fmt.decisionLine).join("\n") : "No decisions.", data: { items } };
    },
    { readOnly: true },
  );
  tool(
    "decision_view",
    "One decision in full.",
    { ref: z.string().describe("DEC-3") },
    async (args, access) => {
      const d = await svc.getDecision(access, String(args.ref));
      return { text: fmt.decisionText(d), data: d };
    },
    { readOnly: true },
  );
  tool(
    "decision_edit",
    "Change a decision (status, context, decision, consequences), or archive/restore it.",
    {
      ref: z.string().describe("DEC-3"),
      title: z.string().optional(),
      status: decisionStatus.optional(),
      context: z.string().optional(),
      decision: z.string().optional(),
      consequences: z.string().optional(),
      archived: archivedArg,
    },
    async (args, access) => {
      const { ref: r, archived, ...rest } = args;
      const fields = toInput(rest);
      let d = Object.keys(fields).length ? await svc.updateDecision(access, String(r), fields as Parameters<typeof svc.updateDecision>[2]) : await svc.getDecision(access, String(r));
      if (archived === true) d = await svc.archiveDecision(access, String(r));
      if (archived === false) d = await svc.restoreDecision(access, String(r));
      return { text: `Updated ${fmt.decisionLine(d)}`, data: d };
    },
  );

  // ── Activity / statistics ──────────────────────────────────────────────────
  tool(
    "activity",
    "Recent changes, newest first. Filter by Space, entity ref (T-12, DOC-3) or who made them.",
    {
      space_id: z.string().optional(),
      entity_ref: z.string().optional(),
      by: z.string().optional().describe("Only changes by this actor"),
      limit: z.number().int().min(1).max(200).optional(),
      before: z.number().int().optional().describe("Cursor from a previous call"),
    },
    async (args, access) => {
      const page = await svc.listActivity(access, {
        spaceId: args.space_id as string | undefined,
        entityRef: args.entity_ref as string | undefined,
        actor: args.by as string | undefined,
        limit: (args.limit as number | undefined) ?? 30,
        before: args.before as number | undefined,
      });
      return { text: fmt.activityText(page.items, page.nextBefore), data: page };
    },
    { readOnly: true },
  );
  tool(
    "statistics",
    "Counts by status/type/priority, completion %, weekly created vs completed, waiting and oldest open items.",
    { space_id: z.string().optional() },
    async (args, access) => {
      const s = await svc.statistics(access, { spaces: spaceList(args.space_id) });
      return { text: fmt.statisticsText(s), data: s };
    },
    { readOnly: true },
  );
}
