import { z } from "zod";
import { DECISION_STATUSES, SPACE_COLORS } from "./db/schema";
import { Invalid } from "./errors";

/** Parse with a zod schema, throwing `Invalid` with a readable message. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new Invalid(msg || "Invalid input");
  }
  return r.data;
}

const upperRef = (re: RegExp, label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(re, `must look like ${label}`);

export const taskRef = upperRef(/^T-\d+(\.\d+)*$/, "T-12 or T-12.3");
export const milestoneRef = upperRef(/^M-\d+$/, "M-3");
export const documentRef = upperRef(/^DOC-\d+$/, "DOC-3");
export const decisionRef = upperRef(/^DEC-\d+$/, "DEC-3");
export const spaceId = z
  .string()
  .trim()
  .regex(/^sp_[a-z2-7]{10}$/, "must be a Space id (sp_…)");

const name = z.string().trim().min(1, "required").max(200);
const shortText = z.string().trim().min(1).max(100);
const longText = z.string().max(200_000);
const strList = z.array(z.string().trim().min(1).max(2000)).max(500);
const tagList = z.array(shortText).max(100);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .nullable();
const stringOrList = z.union([z.string(), z.array(z.string())]).transform((v) =>
  (Array.isArray(v) ? v : v.split(","))
    .map((s) => s.trim())
    .filter(Boolean),
);
const bool = z.union([z.boolean(), z.enum(["true", "false", "1", "0"])]).transform((v) => v === true || v === "true" || v === "1");
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const spaceColor = z.enum(SPACE_COLORS);

// ── Spaces ────────────────────────────────────────────────────────────────────
export const createSpaceInput = z.object({
  name,
  description: z.string().max(5000).optional(),
  color: spaceColor.optional(),
});
export const updateSpaceInput = z.object({
  name: name.optional(),
  description: z.string().max(5000).optional(),
  color: spaceColor.optional(),
});
export const listSpacesInput = z.object({ includeArchived: bool.optional() }).default({});

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const createTaskInput = z.object({
  spaceId: spaceId.optional(),
  parent: taskRef.optional(),
  isDraft: z.boolean().optional(),
  title: name,
  description: longText.optional(),
  status: shortText.optional(),
  type: shortText.optional(),
  priority: shortText.nullable().optional(),
  labels: tagList.optional(),
  assignees: tagList.optional(),
  milestone: milestoneRef.nullable().optional(),
  dueDate: isoDate.optional(),
  plan: longText.optional(),
  notes: longText.optional(),
  finalSummary: longText.optional(),
  references: strList.optional(),
  documentation: strList.optional(),
  modifiedFiles: strList.optional(),
  acceptanceCriteria: strList.optional(),
  definitionOfDone: strList.optional(),
  noDodDefaults: z.boolean().optional(),
  dependsOn: z.array(taskRef).max(100).optional(),
});
export type CreateTaskInput = z.input<typeof createTaskInput>;

const indexList = z.array(z.number().int().min(1)).max(500);
const editItems = z.array(z.object({ index: z.number().int().min(1), text: z.string().trim().min(1).max(2000) })).max(500);

export const updateTaskInput = z.object({
  title: name.optional(),
  description: longText.optional(),
  status: shortText.optional(),
  type: shortText.optional(),
  priority: shortText.nullable().optional(),
  labels: tagList.optional(),
  assignees: tagList.optional(),
  milestone: milestoneRef.nullable().optional(),
  dueDate: isoDate.optional(),
  plan: longText.optional(),
  notes: longText.optional(),
  finalSummary: longText.optional(),
  references: strList.optional(),
  documentation: strList.optional(),
  modifiedFiles: strList.optional(),
  /** Top-level tasks only; moves children with it. */
  spaceId: spaceId.optional(),
  // checklist ops (indexes are 1-based positions in the current list)
  addAc: strList.optional(),
  checkAc: indexList.optional(),
  uncheckAc: indexList.optional(),
  removeAc: indexList.optional(),
  editAc: editItems.optional(),
  /** Replace the whole list; items with identical text keep their checked state. */
  setAc: strList.optional(),
  /** New order as 1-based indexes of the current list (a permutation). */
  reorderAc: indexList.optional(),
  addDod: strList.optional(),
  checkDod: indexList.optional(),
  uncheckDod: indexList.optional(),
  removeDod: indexList.optional(),
  editDod: editItems.optional(),
  setDod: strList.optional(),
  reorderDod: indexList.optional(),
  appendNotes: z.string().min(1).max(200_000).optional(),
  appendPlan: z.string().min(1).max(200_000).optional(),
  addLabels: tagList.optional(),
  removeLabels: tagList.optional(),
  addDeps: z.array(taskRef).max(100).optional(),
  removeDeps: z.array(taskRef).max(100).optional(),
});
export type UpdateTaskInput = z.input<typeof updateTaskInput>;

export const TASK_SORTS = [
  "ordinal",
  "ref",
  "title",
  "status",
  "type",
  "priority",
  "space",
  "milestone",
  "ac",
  "created",
  "updated",
] as const;

export const listTasksInput = z
  .object({
    spaces: stringOrList.optional(),
    status: stringOrList.optional(),
    excludeStatus: stringOrList.optional(),
    type: stringOrList.optional(),
    /** All of these labels. */
    labels: stringOrList.optional(),
    priority: stringOrList.optional(),
    assignee: z.string().trim().min(1).optional(),
    /** Milestone ref, or "none" for tasks without one. */
    milestone: z.string().trim().min(1).optional(),
    /** Children of this task ref. */
    parent: taskRef.optional(),
    topLevelOnly: bool.optional(),
    q: z.string().trim().max(500).optional(),
    includeArchived: bool.optional(),
    archivedOnly: bool.optional(),
    /** Default "exclude". */
    drafts: z.enum(["exclude", "include", "only"]).optional(),
    sort: z.enum(TASK_SORTS).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: int(1, 1000).optional(),
    offset: int(0, 1_000_000).optional(),
  })
  .default({});
export type ListTasksInput = z.input<typeof listTasksInput>;

export const moveTaskInput = z.object({
  ref: taskRef,
  status: shortText.optional(),
  /** Explicit ordinal; otherwise placed between beforeRef/afterRef, or at the end of the column. */
  ordinal: z.number().finite().optional(),
  /** Place directly above this task. */
  beforeRef: taskRef.optional(),
  /** Place directly below this task. */
  afterRef: taskRef.optional(),
});
export type MoveTaskInput = z.input<typeof moveTaskInput>;

export const reorderTasksInput = z.object({
  status: shortText.optional(),
  refs: z.array(taskRef).min(1).max(1000),
});

export const cleanupDoneInput = z.object({
  olderThanDays: int(0, 3650),
  spaces: stringOrList.optional(),
});

export const commentInput = z.object({ body: z.string().trim().min(1).max(50_000) });

// ── Milestones / documents / decisions ───────────────────────────────────────
export const createMilestoneInput = z.object({
  spaceId: spaceId.optional(),
  title: name,
  description: longText.optional(),
  dueDate: isoDate.optional(),
});
export const updateMilestoneInput = z.object({
  title: name.optional(),
  description: longText.optional(),
  dueDate: isoDate.optional(),
});
export const createDocumentInput = z.object({
  spaceId: spaceId.optional(),
  title: name,
  body: longText.optional(),
});
export const updateDocumentInput = z.object({
  title: name.optional(),
  body: longText.optional(),
});
export const decisionStatus = z.enum(DECISION_STATUSES);
export const createDecisionInput = z.object({
  spaceId: spaceId.optional(),
  title: name,
  status: decisionStatus.optional(),
  context: longText.optional(),
  decision: longText.optional(),
  consequences: longText.optional(),
});
export const updateDecisionInput = z.object({
  title: name.optional(),
  status: decisionStatus.optional(),
  context: longText.optional(),
  decision: longText.optional(),
  consequences: longText.optional(),
});
export const listEntitiesInput = z
  .object({
    spaces: stringOrList.optional(),
    includeArchived: bool.optional(),
    archivedOnly: bool.optional(),
    q: z.string().trim().max(500).optional(),
    status: decisionStatus.optional(),
  })
  .default({});
export type ListEntitiesInput = z.input<typeof listEntitiesInput>;

// ── Search / stats / activity ────────────────────────────────────────────────
export const SEARCH_KINDS = ["task", "document", "decision"] as const;
export const searchInput = z.object({
  q: z.string().trim().max(500),
  types: z.array(z.enum(SEARCH_KINDS)).optional(),
  spaces: stringOrList.optional(),
  includeArchived: bool.optional(),
  limit: int(1, 200).optional(),
});

export const statisticsInput = z.object({ spaces: stringOrList.optional() }).default({});

export const listActivityInput = z
  .object({
    spaceId: z.string().trim().optional(),
    entityRef: z
      .string()
      .trim()
      .transform((s) => (/^(t|m|doc|dec)-\d/i.test(s) ? s.toUpperCase() : s))
      .optional(),
    actor: z.string().trim().min(1).optional(),
    limit: int(1, 200).optional(),
    /** Activity id cursor: return rows older than this. */
    before: int(1, Number.MAX_SAFE_INTEGER).optional(),
  })
  .default({});

// ── Settings ─────────────────────────────────────────────────────────────────
const configList = z
  .array(shortText)
  .max(50)
  .refine((a) => new Set(a).size === a.length, "values must be unique");
const renames = z.array(z.object({ from: shortText, to: shortText })).max(50);
export const updateSettingsInput = z.object({
  statuses: configList.min(1).optional(),
  defaultStatus: shortText.optional(),
  types: configList.min(1).optional(),
  priorities: configList.optional(),
  labels: configList.optional(),
  dodDefaults: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  /** Explicit renames; existing tasks are migrated. Applied before removals are checked. */
  renames: z
    .object({
      statuses: renames.optional(),
      types: renames.optional(),
      priorities: renames.optional(),
      labels: renames.optional(),
    })
    .optional(),
});
export type UpdateSettingsInput = z.input<typeof updateSettingsInput>;
