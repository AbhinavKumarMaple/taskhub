/**
 * The self-describing guide a chat reads with one call: `curl <host>/api/v1`.
 * Everything a chat needs to track work over plain HTTP: auth, Spaces, the tracking rules
 * written as curl calls, and the endpoint reference. Contains no secrets.
 */

export function buildCurlGuide(base: string): string {
  const api = `${base.replace(/\/$/, "")}/api/v1`;
  const H = `-H "Authorization: Bearer $TASKHUB_TOKEN" -H "X-Space-Key: $TASKHUB_KEY" -H "X-Actor: <your name>"`;
  const J = `-H "Content-Type: application/json"`;
  return `# Taskhub — guide for chats (curl)

Taskhub is the owner's task tracker. You read and write it with plain HTTP calls to \`${api}\`.
Every response is JSON unless noted. Read this whole page once, then follow the rules below.

## 1. Credentials

- \`TASKHUB_TOKEN\`: the agent token. The owner gives it to you. Send it on every call as
  \`Authorization: Bearer $TASKHUB_TOKEN\`.
- \`TASKHUB_KEY\`: a Space key (\`sk_…\`). A Space is one board. You can only see and change Spaces whose key
  you send in \`X-Space-Key\` (comma-separate several keys). Anything else answers 404.
- \`X-Actor\`: a short name for yourself (e.g. the chat's topic); it is written to the history.

If the owner gave you a key, use it. If not, create your own Space and keep the key for the rest of the chat:

\`\`\`bash
curl -s -X POST ${api}/spaces -H "Authorization: Bearer $TASKHUB_TOKEN" ${J} \\
  -d '{"name":"<short topic of this chat>","description":"<one line>"}'
# → {"id":"sp_…","key":"sk_…", …}   tell the owner the key so they can share it with other chats
\`\`\`

Check what your key opens (also lists the allowed statuses, types, priorities and labels):

\`\`\`bash
curl -s ${api}/spaces ${H}
curl -s ${api}/settings ${H}
\`\`\`

## 2. Tracking rules

Track any request that asks for work (build, change, fix, write, set up). Do not track pure questions.
Track before you start, without asking permission.

| Type | Use it for | Where |
|---|---|---|
| \`feature\` | a feature or block of work | top level; shown on the owner's main board |
| \`sub-feature\` | one part of a feature | \`"parent":"T-12"\` |
| \`fix\` | something broken | under its feature, or top level |
| \`minor\` | a small tweak (typo, label, spacing) | create with status Done, then archive |

1. **Search first** (word order does not matter) and update an existing item instead of duplicating:
   \`curl -s "${api}/search?q=<one or two words>" ${H}\`
2. **Create** a feature, then one sub-feature per separate part. Give each sub-feature its checks as
   \`acceptance_criteria\`, and give the feature one check per sub-feature worded \`<child ref> <child title>\`
   so its card shows progress:
   \`\`\`bash
   curl -s -X POST ${api}/tasks ${H} ${J} -d '{"title":"Statements page","type":"feature","description":"Why it exists, one line"}'
   curl -s -X POST ${api}/tasks ${H} ${J} -d '{"title":"Monthly list","parent":"T-12","acceptance_criteria":["Lists every month"]}'
   curl -s -X PATCH ${api}/tasks/T-12 ${H} ${J} -d '{"add_ac":["T-12.1 Monthly list"]}'
   \`\`\`
3. **Start**: set the item and its feature to In Progress; write the plan for anything non-trivial.
   \`curl -s -X PATCH ${api}/tasks/T-12.1 ${H} ${J} -d '{"status":"In Progress","append_plan":"1. …"}'\`
   A feature stays In Progress until all its children are Done; never move it back to To Do.
4. **Progress**: \`{"append_notes":"…"}\`. Tick a check only once verified: \`{"check_ac":[1]}\` (1-based).
5. **Waiting** on the owner: add the label to the item AND its feature, and say why:
   \`{"add_labels":["waiting"],"append_notes":"Waiting on: …"}\`; when unblocked \`{"remove_labels":["waiting"]}\`.
6. **Done**: \`{"final_summary":"…","modified_files":["…"],"status":"Done"}\`, then tick the feature's check for
   that child (\`{"check_ac":[n]}\`). Close the feature the same way when every child is Done.
7. **Minor**: once the tweak is done,
   \`curl -s -X POST ${api}/tasks ${H} ${J} -d '{"title":"…","type":"minor","status":"Done","final_summary":"…"}'\`
   then \`curl -s -X POST ${api}/tasks/T-NN/archive ${H}\`.
8. **Mention refs** (e.g. "Tracked as T-12, T-12.1") in your replies to the owner.

## 3. Endpoints

Body and query keys work in snake_case or camelCase. Refs are global: \`T-12\`, \`T-12.3\`, \`M-3\`, \`DOC-3\`, \`DEC-3\`.
Errors: \`{"error":{"code","message"}}\` with 400 invalid, 401 bad token, 404 not found / not yours, 409 conflict.

Tasks
- \`GET /tasks\` filters: \`q\`, \`status\`, \`exclude_status\`, \`type\`, \`labels\`, \`priority\`, \`assignee\`,
  \`milestone\`, \`parent\`, \`top_level_only\`, \`include_archived\`, \`archived_only\`, \`drafts=exclude|include|only\`,
  \`sort\`, \`order\`, \`limit\`, \`offset\` → \`{items,total}\`
- \`POST /tasks\` \`{title, type?, parent?, status?, priority?, labels?, assignees?, milestone?, due_date?,
  description?, plan?, notes?, final_summary?, references?, documentation?, modified_files?,
  acceptance_criteria?, definition_of_done?, depends_on?, is_draft?}\`
- \`GET /tasks/{ref}\` full task (checklists, children, dependencies, comments, history)
- \`PATCH /tasks/{ref}\` any field, plus \`add_ac\`, \`check_ac\`, \`uncheck_ac\`, \`remove_ac\`, \`edit_ac\` [{index,text}],
  \`set_ac\`, \`reorder_ac\` (same for \`_dod\`), \`append_notes\`, \`append_plan\`, \`add_labels\`, \`remove_labels\`,
  \`add_deps\`, \`remove_deps\`, \`parent\` (ref or null)
- \`POST /tasks/{ref}/archive|restore|promote|demote\`, \`GET|POST /tasks/{ref}/comments\` \`{body}\`
- \`DELETE /tasks/{ref}\` (archived only), \`POST /tasks/move\` \`{ref, status?, before_ref?, after_ref?}\`,
  \`POST /tasks/cleanup\` \`{older_than_days}\`

Other
- \`GET|POST /milestones\`, \`/documents\`, \`/decisions\`; \`GET|PATCH|DELETE /{kind}/{ref}\`; \`POST /{kind}/{ref}/archive|restore\`
  (document \`{title, body}\`; decision \`{title, status, context, decision, consequences}\`; milestone \`{title, due_date}\`)
- \`GET /search?q=\` · \`GET /statistics\` · \`GET /activity\` · \`GET /board.md\` (the board as markdown) · \`GET /settings\`

Quick look at the board: \`curl -s "${api}/board.md?type=feature" ${H}\`
`;
}

/** The public base URL of this request, honouring proxies (Vercel sets x-forwarded-*). */
export function baseUrlFrom(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
