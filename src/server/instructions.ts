/**
 * Tracking rules for chats. Returned by the MCP `instructions` tool and shown on /connect
 * (to paste into a global CLAUDE.md). Plain markdown; tool names refer to the MCP endpoint.
 */
export const TRACKING_RULES = `# Taskhub tracking rules

Taskhub is where work is tracked. You see only the Spaces whose key you pass as \`space_key\`
(comma-separate several keys). Refs are global: T-12 means one task everywhere.

## Item kinds

| Type | Use it for | Where it goes |
|---|---|---|
| \`feature\` | a feature or block of work | top level; shown on the main board |
| \`sub-feature\` | one part of a feature | child of that feature (\`parent\`) |
| \`fix\` | something broken | child of the feature it breaks, or top level |
| \`minor\` | a small tweak | create it with status Done, then archive it |

## Rules

1. **Search first.** Before creating anything, \`search\` (or \`task_list\` with \`q\`) for an existing item.
   Word order does not matter. Update the existing item instead of making a duplicate.
2. **Pick the kind** from the table. New work is a \`feature\`; each separable part is a \`sub-feature\`
   under it; a bug is a \`fix\` (under its feature when it has one).
3. **One check per sub-feature.** When you add a sub-feature, also add one acceptance criterion with
   the same title on its feature (\`task_edit\` → \`add_ac\`). Check it off when the sub-feature is Done.
4. **In Progress.** Move an item to In Progress when you start on it, and its feature too. Keep only what
   you are actively working on In Progress. Write the plan into \`plan\` before you start on anything
   non-trivial, and append progress to \`notes\` as you go.
5. **Waiting.** When an item is blocked on the owner or someone else, add the \`waiting\` label to the item
   and to its parent feature, and say what you are waiting for in \`notes\`. Remove the label from both when
   it is unblocked.
6. **Done.** Check the item's acceptance criteria, write a short \`final_summary\`, list \`modified_files\`,
   then set the status to Done. When every sub-feature of a feature is Done, close the feature the same way.
7. **Minor tweaks.** Create the item with status Done and a one-line summary, then archive it
   (\`task_archive\`), so it is recorded without cluttering the board.
8. **Mention refs.** In every reply to the owner, name the refs you created or changed (e.g. "T-12, T-12.3").

## Useful calls

- \`space_info\` — the Spaces your keys open, with statuses, types, priorities and labels.
- \`task_create\` (title, type, parent, status, priority, labels, description, acceptance_criteria …)
- \`task_edit\` (any field; \`add_ac\`, \`check_ac\`, \`uncheck_ac\`, \`remove_ac\`, \`set_ac\`, \`append_notes\`,
  \`append_plan\`, \`add_labels\`, \`remove_labels\`, \`add_deps\`, \`remove_deps\`)
- \`task_view\`, \`task_list\`, \`board\`, \`task_comment\`, \`task_archive\`, \`activity\`
- \`doc_create\` for longer write-ups, \`decision_create\` for choices worth remembering.
`;

export function getInstructions(): string {
  return TRACKING_RULES;
}
