/**
 * Client-safe shapes returned by the service layer (src/server/service/*).
 * Dates are `Date` objects on the server; when passed from a Server Component to a Client
 * Component React serialises them as Date, so they stay `Date`. JSON (REST/MCP) turns them into ISO strings.
 */

export const SPACE_COLORS = ["gray", "blue", "green", "amber", "red", "purple", "pink", "teal"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type EntityType = "task" | "milestone" | "document" | "decision" | "space" | "settings";
export type ActivityAction =
  | "created"
  | "updated"
  | "status"
  | "archived"
  | "restored"
  | "deleted"
  | "commented"
  | "promoted"
  | "demoted"
  | "moved";

/** `{ actor, spaces }` — every service call takes one. `spaces: 'all'` = owner. */
export type Access = { actor: string; spaces: "all" | string[] };

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export type Settings = {
  statuses: string[];
  defaultStatus: string;
  /** The last status; the "done" one. */
  doneStatus: string;
  types: string[];
  priorities: string[];
  labels: string[];
  dodDefaults: string[];
  updatedAt: Date;
};

export type SpaceRef = { id: string; name: string; color: SpaceColor };

export type Space = SpaceRef & {
  description: string;
  key: string;
  createdAt: Date;
  archivedAt: Date | null;
};

export type SpaceWithCounts = Space & {
  counts: {
    /** Non-archived, non-draft tasks. */
    total: number;
    /** Of those, not in the done status. */
    open: number;
    drafts: number;
    archived: number;
    byStatus: Record<string, number>;
  };
};

export type ChecklistItem = { id: number; text: string; checked: boolean; position: number };

export type TaskSummary = {
  id: number;
  ref: string;
  space: SpaceRef;
  parentRef: string | null;
  isDraft: boolean;
  title: string;
  status: string;
  type: string;
  priority: string | null;
  labels: string[];
  assignees: string[];
  milestone: { ref: string; title: string } | null;
  dueDate: string | null;
  ordinal: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  acDone: number;
  acTotal: number;
  dodDone: number;
  dodTotal: number;
  /** Non-archived children by status. */
  childCounts: Record<string, number>;
  childTotal: number;
  /** Children in the done status. */
  childDone: number;
};

export type TaskLite = { ref: string; title: string; status: string; type: string; archivedAt: Date | null };

/** A dependency in a transitive tree. depth 1 = direct; `via` = the ref it hangs under (null for direct). */
export type DepNode = TaskLite & { depth: number; via: string | null };

export type Comment = { id: number; author: string; body: string; createdAt: Date };

export type Activity = {
  id: number;
  spaceId: string | null;
  entityType: EntityType;
  entityRef: string;
  action: ActivityAction;
  actor: string;
  summary: string;
  changes: FieldChanges;
  createdAt: Date;
};

export type TaskFull = TaskSummary & {
  description: string;
  plan: string;
  notes: string;
  finalSummary: string;
  references: string[];
  documentation: string[];
  modifiedFiles: string[];
  acceptanceCriteria: ChecklistItem[];
  definitionOfDone: ChecklistItem[];
  parent: TaskLite | null;
  children: TaskSummary[];
  /** What this task waits on, transitive, depth-first. */
  dependsOn: DepNode[];
  /** What waits on this task, transitive, depth-first. */
  blocks: DepNode[];
  comments: Comment[];
  /** Newest first, up to 100. */
  activity: Activity[];
};

export type TaskList = { items: TaskSummary[]; total: number };

export type Milestone = {
  id: number;
  ref: string;
  space: SpaceRef;
  title: string;
  description: string;
  dueDate: string | null;
  createdAt: Date;
  archivedAt: Date | null;
  /** Non-archived, non-draft tasks in it. */
  taskTotal: number;
  taskDone: number;
};
export type MilestoneFull = Milestone & { tasks: TaskSummary[] };

export type DocumentSummary = {
  id: number;
  ref: string;
  space: SpaceRef;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};
export type DocumentFull = DocumentSummary & { body: string };

export type DecisionSummary = {
  id: number;
  ref: string;
  space: SpaceRef;
  title: string;
  status: DecisionStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};
export type DecisionFull = DecisionSummary & { context: string; decision: string; consequences: string };

export type SearchKind = "task" | "document" | "decision";
export type SearchResult = {
  kind: SearchKind;
  ref: string;
  title: string;
  /** Short text around the first body match ("" if the match was only in the title/ref). */
  snippet: string;
  space: SpaceRef;
  /** Task status or decision status. */
  status: string | null;
  /** Task type. */
  type: string | null;
  archived: boolean;
  score: number;
};

export type CountRow = { name: string; count: number };
export type Statistics = {
  /** Non-archived, non-draft tasks. */
  total: number;
  byStatus: CountRow[];
  byType: CountRow[];
  byPriority: CountRow[];
  completion: { done: number; total: number; percent: number };
  /** Last 8 weeks, oldest first. weekStart = Monday (YYYY-MM-DD, UTC). */
  weekly: { weekStart: string; created: number; completed: number }[];
  /** Up to 10 oldest not-done tasks. */
  oldestOpen: TaskSummary[];
  /** Tasks labelled `waiting` (not done). */
  waiting: TaskSummary[];
};

export type ActivityPage = { items: Activity[]; nextBefore: number | null };

export type NavCounts = {
  /** Board: non-archived, non-draft tasks (all types). */
  board: number;
  tasks: number;
  drafts: number;
  archive: number;
  milestones: number;
  documents: number;
  decisions: number;
};
