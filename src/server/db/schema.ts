import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);

/** Global sequence behind top-level task refs: T-<n>. */
export const taskRefSeq = pgSequence("task_ref_seq", { startWith: 1, increment: 1 });

/** Named counters behind M-<n>, DOC-<n> and DEC-<n> refs (rows: milestone, document, decision). */
export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  statuses: textArray("statuses"),
  defaultStatus: text("default_status").notNull(),
  types: textArray("types"),
  priorities: textArray("priorities"),
  labels: textArray("labels"),
  dodDefaults: textArray("dod_defaults"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const SPACE_COLORS = ["gray", "blue", "green", "amber", "red", "purple", "pink", "teal"] as const;

export const spaces = pgTable("spaces", {
  id: text("id").primaryKey(),
  // Unique only among the Spaces a caller can see (checked in the service), so a chat cannot probe
  // for the names of Spaces it does not hold.
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  key: text("key").notNull().unique(),
  color: text("color").notNull().default("blue"),
  createdAt: ts("created_at").notNull().defaultNow(),
  archivedAt: ts("archived_at"),
});

export const milestones = pgTable(
  "milestones",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueDate: date("due_date", { mode: "string" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("milestones_space_idx").on(t.spaceId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    isDraft: boolean("is_draft").notNull().default(false),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull(),
    type: text("type").notNull(),
    priority: text("priority"),
    labels: textArray("labels"),
    assignees: textArray("assignees"),
    milestoneId: integer("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    dueDate: date("due_date", { mode: "string" }),
    plan: text("plan").notNull().default(""),
    notes: text("notes").notNull().default(""),
    finalSummary: text("final_summary").notNull().default(""),
    references: textArray("references"),
    documentation: textArray("documentation"),
    modifiedFiles: textArray("modified_files"),
    ordinal: doublePrecision("ordinal").notNull().default(0),
    childCounter: integer("child_counter").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [
    index("tasks_space_idx").on(t.spaceId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_status_idx").on(t.status),
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "tasks_parent_fk" }),
  ],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    list: text("list", { enum: ["ac", "dod"] }).notNull(),
    text: text("text").notNull(),
    checked: boolean("checked").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("checklist_task_idx").on(t.taskId)],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: integer("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnId] }), index("deps_depends_on_idx").on(t.dependsOnId)],
);

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("documents_space_idx").on(t.spaceId)],
);

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "superseded"] as const;

export const decisions = pgTable(
  "decisions",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: DECISION_STATUSES }).notNull().default("proposed"),
    context: text("context").notNull().default(""),
    decision: text("decision").notNull().default(""),
    consequences: text("consequences").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    archivedAt: ts("archived_at"),
  },
  (t) => [index("decisions_space_idx").on(t.spaceId)],
);

export const ENTITY_TYPES = ["task", "milestone", "document", "decision", "space", "settings"] as const;
export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "status",
  "archived",
  "restored",
  "deleted",
  "commented",
  "promoted",
  "demoted",
  "moved",
] as const;

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export const activity = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    // No FK: activity outlives deleted tasks. Null for settings changes.
    spaceId: text("space_id"),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityRef: text("entity_ref").notNull(),
    action: text("action", { enum: ACTIVITY_ACTIONS }).notNull(),
    actor: text("actor").notNull(),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<FieldChanges>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_space_idx").on(t.spaceId, t.id),
    index("activity_entity_idx").on(t.entityRef),
  ],
);

/** Failed owner sign-ins per client (IP), for the login rate limit. Shared by every server instance. */
export const loginFailures = pgTable("login_failures", {
  client: text("client").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
});

export type SpaceRow = typeof spaces.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ChecklistRow = typeof checklistItems.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
