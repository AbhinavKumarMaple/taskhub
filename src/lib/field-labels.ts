/** Readable names for stored field keys, used in activity summaries and field diffs. */
export const FIELD_LABELS: Record<string, string> = {
  acceptanceCriteria: "acceptance criteria",
  definitionOfDone: "definition of done",
  finalSummary: "final summary",
  modifiedFiles: "modified files",
  dueDate: "due date",
  spaceId: "Space",
  dependsOn: "depends on",
  isDraft: "draft",
  parentId: "parent",
  milestoneId: "milestone",
  defaultStatus: "default status",
  dodDefaults: "Definition of Done defaults",
  statusReason: "reason",
  doneStatus: "done status",
  closedStatuses: "finished statuses",
  reasonStatuses: "statuses that need a reason",
  attachments: "screenshots",
};

/** `finalSummary` → "final summary"; known keys use FIELD_LABELS. */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "title, due date, final summary" */
export function fieldList(keys: string[]): string {
  return keys.map(fieldLabel).join(", ");
}
