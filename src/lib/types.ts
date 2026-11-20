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
  | "moved"
  | "attached"
  | "deployed";

/** `{ actor, spaces }` — every service call takes one. `spaces: 'all'` = owner. */
export type Access = { actor: string; spaces: "all" | string[] };

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export type Settings = {
  statuses: string[];
  defaultStatus: string;
  /** The completed status (ticks the box). */
  doneStatus: string;
  /** Finished statuses (done + e.g. Cancelled): not "open", count toward a parent's progress. */
  closedStatuses: string[];
  /** Moving into these needs a reason (e.g. Blocked, Cancelled). */
  reasonStatuses: string[];
  /** Reason statuses that are not closed: work that has stopped and needs attention (e.g. Blocked). */
  stoppedStatuses: string[];
  types: string[];
  priorities: string[];
  labels: string[];
  dodDefaults: string[];
  /** Where code ships, in order (e.g. Development, Production). */
  environments: string[];
  updatedAt: Date;
};

/** A task's current deploy to one environment. `at` is an ISO timestamp. */
export type DeploymentState = { version: string; url: string; note: string; actor: string; at: string };

/** One deploy or roll-back in a task's deploy history. */
export type DeploymentEvent = {
  id: number;
  environment: string;
  action: "deployed" | "rolled_back";
  version: string;
  url: string;
  note: string;
  actor: string;
  createdAt: Date;
};

/** A deploy-log row across tasks (GET /deployments). */
export type DeploymentLogEntry = DeploymentEvent & { task: { ref: string; title: string; status: string }; space: SpaceRef };

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
  /** Why it is in this status ("" when none was given). */
  statusReason: string;
  /** When it entered this status. */
  statusChangedAt: Date;
  /** Ships code: its deploys are tracked and "not deployed" shows until it is. */
  deployable: boolean;
  /** Environment → current deploy. Missing environment = not deployed there. */
  deployments: Record<string, DeploymentState>;
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
  /** Children in a closed status (done or cancelled). */
  childDone: number;
};

export type TaskLite = { ref: string; title: string; status: string; type: string; archivedAt: Date | null };

/** A dependency in a transitive tree. depth 1 = direct; `via` = the ref it hangs under (null for direct). */
export type DepNode = TaskLite & { depth: number; via: string | null };

/** One step in a task's status trail. `from` is null for the first status. */
export type StatusEvent = {
  id: number;
  from: string | null;
  to: string;
  reason: string;
  actor: string;
  createdAt: Date;
};

export type Attachment = {
  id: number;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  caption: string;
  actor: string;
  createdAt: Date;
  /** Path under /api/v1 that serves the image. */
  url: string;
};

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
  /** Oldest first: every status the task has been in, with who moved it and why. */
  statusHistory: StatusEvent[];
  /** Screenshots, oldest first (metadata only; fetch `url` for the image). */
  attachments: Attachment[];
  /** Oldest first: every deploy and roll-back, per environment. */
  deployHistory: DeploymentEvent[];
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
  /** Non-archived tasks in a stopped status (Blocked). */
  blocked: number;
  drafts: number;
  archive: number;
  milestones: number;
  documents: number;
  decisions: number;
};
