/**
 * Concise text renderings for MCP tool results. The structured JSON goes alongside;
 * the text is what a chat reads first, so keep it short and scannable.
 */
import type {
  Activity,
  ChecklistItem,
  DecisionFull,
  DecisionSummary,
  DeploymentLogEntry,
  DepNode,
  DocumentFull,
  DocumentSummary,
  Milestone,
  SearchResult,
  Settings,
  SpaceWithCounts,
  Statistics,
  TaskFull,
  TaskSummary,
} from "@/lib/types";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** `T-12 [In Progress] Title (feature, High, #waiting) · AC 1/3 · 2/4 sub-tasks done` */
export function taskLine(t: TaskSummary): string {
  const bits = [t.type, t.priority, ...t.labels.map((l) => `#${l}`)].filter(Boolean);
  const extra = [
    t.acTotal ? `AC ${t.acDone}/${t.acTotal}` : "",
    t.childTotal ? `${t.childDone}/${t.childTotal} sub-tasks done` : "",
    t.milestone ? `${t.milestone.ref}` : "",
    t.isDraft ? "draft" : "",
    t.archivedAt ? "archived" : "",
    deployText(t),
  ].filter(Boolean);
  const why = t.statusReason && t.status !== "Done" ? ` — ${t.statusReason}` : "";
  return `${t.ref} [${t.status}${why}] ${t.title} (${bits.join(", ")})${extra.length ? " · " + extra.join(" · ") : ""}`;
}

/** "deployed: Development, Production" / "not deployed" / "" for plain tasks. */
function deployText(t: TaskSummary): string {
  const envs = Object.keys(t.deployments ?? {});
  if (envs.length) return `deployed: ${envs.join(", ")}`;
  return t.deployable ? "not deployed" : "";
}

function checklist(title: string, items: ChecklistItem[]): string[] {
  if (!items.length) return [];
  const done = items.filter((i) => i.checked).length;
  return [
    `${title} (${done}/${items.length}):`,
    ...items.map((i, n) => `  ${n + 1}. [${i.checked ? "x" : " "}] ${i.text}`),
  ];
}

function deps(title: string, nodes: DepNode[]): string[] {
  if (!nodes.length) return [];
  return [
    `${title}:`,
    ...nodes.map((d) => `${"  ".repeat(d.depth)}${d.ref} [${d.status}] ${d.title}${d.archivedAt ? " (archived)" : ""}`),
  ];
}

function section(title: string, body: string): string[] {
  return body.trim() ? [`${title}:`, body.trim()] : [];
}

function list(title: string, items: string[]): string[] {
  return items.length ? [`${title}: ${items.join(", ")}`] : [];
}

export function taskDetail(t: TaskFull): string {
  const meta = [
    `Space: ${t.space.name} (${t.space.id})`,
    t.parent ? `Parent: ${t.parent.ref} ${t.parent.title}` : "",
    t.priority ? `Priority: ${t.priority}` : "",
    t.labels.length ? `Labels: ${t.labels.join(", ")}` : "",
    t.assignees.length ? `Assignees: ${t.assignees.join(", ")}` : "",
    t.milestone ? `Milestone: ${t.milestone.ref} ${t.milestone.title}` : "",
    t.dueDate ? `Due: ${t.dueDate}` : "",
    t.isDraft ? "Draft" : "",
    t.archivedAt ? `Archived ${iso(t.archivedAt)}` : "",
    `Updated ${iso(t.updatedAt)}`,
  ].filter(Boolean);
  const lines = [
    `${t.ref} [${t.status}] ${t.title} (${t.type})`,
    meta.join(" · "),
    ...section("Description", t.description),
    ...checklist("Acceptance criteria", t.acceptanceCriteria),
    ...checklist("Definition of Done", t.definitionOfDone),
    ...section("Plan", t.plan),
    ...section("Notes", t.notes),
    ...section("Final summary", t.finalSummary),
    ...(t.children.length
      ? [`Sub-tasks (${t.childDone}/${t.childTotal} done):`, ...t.children.map((c) => `  ${taskLine(c)}`)]
      : []),
    ...deps("Depends on", t.dependsOn),
    ...deps("Blocks", t.blocks),
    ...list("References", t.references),
    ...list("Documentation", t.documentation),
    ...list("Modified files", t.modifiedFiles),
    ...(t.comments.length
      ? [`Comments (${t.comments.length}):`, ...t.comments.map((c) => `  ${iso(c.createdAt)} ${c.author}: ${c.body}`)]
      : []),
    ...(t.attachments.length
      ? [
          `Screenshots (${t.attachments.length}):`,
          ...t.attachments.map((a) => `  #${a.id} ${a.filename}${a.caption ? ` — ${a.caption}` : ""} (GET ${a.url})`),
        ]
      : []),
    ...(t.deployable || t.deployHistory.length
      ? [
          `Deployments: ${Object.entries(t.deployments).map(([e, d]) => `${e}${d.version ? ` ${d.version}` : ""} (${iso(d.at)})`).join(", ") || "not deployed yet"}`,
          ...t.deployHistory.map(
            (e) =>
              `  ${new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")} ${e.action === "deployed" ? "deployed to" : "rolled back from"} ${e.environment}${e.version ? ` ${e.version}` : ""} by ${e.actor}${e.note ? `: ${e.note}` : ""}${e.url ? ` <${e.url}>` : ""}`,
          ),
        ]
      : []),
    ...(t.statusHistory.length > 1
      ? [
          "Status history:",
          ...t.statusHistory.map(
            (e) => `  ${new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")} ${e.from ?? "created"} → ${e.to} by ${e.actor}${e.reason ? `: ${e.reason}` : ""}`,
          ),
        ]
      : []),
  ];
  return lines.join("\n");
}

export function taskListText(items: TaskSummary[], total: number): string {
  if (!items.length) return "No tasks match.";
  const head = total > items.length ? `${items.length} of ${total} tasks:` : `${total} task${total === 1 ? "" : "s"}:`;
  return [head, ...items.map(taskLine)].join("\n");
}

export function spaceInfoText(spaces: SpaceWithCounts[], settings: Settings): string {
  const lines = spaces.length
    ? spaces.map(
        (s) =>
          `- ${s.name} (${s.id})${s.archivedAt ? " archived" : ""}: ${s.counts.open} open of ${s.counts.total}, ` +
          `${s.counts.drafts} drafts, ${s.counts.archived} archived`,
      )
    : ["No Spaces: pass a space_key (or create one with space_create)."];
  return [
    "Spaces:",
    ...lines,
    `Statuses: ${settings.statuses.join(" → ")} (default ${settings.defaultStatus}; done = ${settings.doneStatus}; finished = ${settings.closedStatuses.join(", ")}; need a reason = ${settings.reasonStatuses.join(", ") || "none"})`,
    `Types: ${settings.types.join(", ")}`,
    `Priorities: ${settings.priorities.join(", ") || "none"}`,
    `Labels: ${settings.labels.join(", ") || "none"}`,
    `Environments: ${settings.environments.join(", ") || "none"}`,
    settings.dodDefaults.length ? `Definition of Done defaults: ${settings.dodDefaults.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function boardText(statuses: string[], items: TaskSummary[]): string {
  const out: string[] = [];
  for (const status of statuses) {
    const col = items.filter((t) => t.status === status);
    out.push(`## ${status} (${col.length})`);
    out.push(...(col.length ? col.map((t) => `- ${taskLine(t)}`) : ["_Empty_"]));
    out.push("");
  }
  return out.join("\n").trimEnd();
}

export function searchText(results: SearchResult[]): string {
  if (!results.length) return "No matches.";
  return results
    .map((r) => {
      const st = r.status ? ` [${r.status}]` : "";
      const snip = r.snippet ? ` — ${r.snippet}` : "";
      return `${r.ref}${st} ${r.title} (${r.kind}${r.type ? `, ${r.type}` : ""}, ${r.space.name}${r.archived ? ", archived" : ""})${snip}`;
    })
    .join("\n");
}

export function milestoneLine(m: Milestone): string {
  return `${m.ref} ${m.title} · ${m.taskDone}/${m.taskTotal} done${m.dueDate ? ` · due ${m.dueDate}` : ""}${m.archivedAt ? " · archived" : ""} (${m.space.name})`;
}

export function docLine(d: DocumentSummary): string {
  return `${d.ref} ${d.title} (${d.space.name}, updated ${iso(d.updatedAt)})${d.archivedAt ? " · archived" : ""}`;
}

export function docText(d: DocumentFull): string {
  return `${docLine(d)}\n\n${d.body || "_Empty_"}`;
}

export function decisionLine(d: DecisionSummary): string {
  return `${d.ref} [${d.status}] ${d.title} (${d.space.name})${d.archivedAt ? " · archived" : ""}`;
}

export function decisionText(d: DecisionFull): string {
  return [
    decisionLine(d),
    ...section("Context", d.context),
    ...section("Decision", d.decision),
    ...section("Consequences", d.consequences),
  ].join("\n");
}

export function activityText(items: Activity[], nextBefore: number | null): string {
  if (!items.length) return "No activity.";
  const lines = items.map((a) => `${new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " ")} ${a.actor}: ${a.summary}`);
  if (nextBefore) lines.push(`(more: before=${nextBefore})`);
  return lines.join("\n");
}

export function statisticsText(s: Statistics): string {
  const rows = (r: { name: string; count: number }[]) => r.map((x) => `${x.name} ${x.count}`).join(", ") || "none";
  return [
    `${s.total} tasks · ${s.completion.percent}% complete (${s.completion.done}/${s.completion.total})`,
    `By status: ${rows(s.byStatus)}`,
    `By type: ${rows(s.byType)}`,
    `By priority: ${rows(s.byPriority)}`,
    `Weekly created/completed: ${s.weekly.map((w) => `${w.weekStart} ${w.created}/${w.completed}`).join(" · ")}`,
    s.waiting.length ? `Waiting (${s.waiting.length}):\n${s.waiting.map((t) => `  ${taskLine(t)}`).join("\n")}` : "Waiting: none",
    s.oldestOpen.length ? `Oldest open:\n${s.oldestOpen.map((t) => `  ${taskLine(t)}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function deploymentLogText(items: DeploymentLogEntry[]): string {
  if (!items.length) return "No deploys recorded.";
  return items
    .map(
      (e) =>
        `${new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")} ${e.task.ref} ${e.action === "deployed" ? "→" : "⟲"} ${e.environment}${e.version ? ` ${e.version}` : ""} by ${e.actor} · ${e.task.title}${e.note ? ` — ${e.note}` : ""}`,
    )
    .join("\n");
}
