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
Responses are JSON, except this guide and \`/board.md\` (markdown). Read this whole page once, then follow the rules below.
Refs like \`T-12\` in the examples are placeholders: refs are global across all Spaces, so always read the real ref
from the response of the call that created the item.

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
   A child created with \`parent\` gets type \`sub-feature\` by default; send \`"type":"fix"\` for a fix.
3. **Start**: set the item AND its feature to In Progress (the feature does not move by itself); write the plan
   for anything non-trivial.
   \`\`\`bash
   curl -s -X PATCH ${api}/tasks/T-12.1 ${H} ${J} -d '{"status":"In Progress","append_plan":"1. …"}'
   curl -s -X PATCH ${api}/tasks/T-12 ${H} ${J} -d '{"status":"In Progress"}'
   \`\`\`
   A feature stays In Progress until all its children are Done; never move it back to To Do.
4. **Progress**: \`{"append_notes":"…"}\`. Tick a check only once verified: \`{"check_ac":[1]}\` (1-based;
   several at once: \`[1,2]\`).
5. **Blocked** (waiting on the owner, someone else, or another task): move the item to Blocked with a \`reason\`
   that says what it waits for and who can unblock it. A reason is required; it shows on the card and stays in the
   task's status history. The feature stays In Progress (its card shows "1 blocked").
   \`\`\`bash
   curl -s -X PATCH ${api}/tasks/T-12.1 ${H} ${J} -d '{"status":"Blocked","reason":"Waiting on: the owner to pick a PDF library"}'
   curl -s -X PATCH ${api}/tasks/T-12.1 ${H} ${J} -d '{"reason":"Waiting on: the owner (asked again 20 Nov)"}'   # update the reason
   curl -s -X PATCH ${api}/tasks/T-12.1 ${H} ${J} -d '{"status":"In Progress","reason":"Owner chose pdfkit"}'     # unblocked
   \`\`\`
6. **Cancelled**: work that will not be done (dropped, duplicate, replaced): \`{"status":"Cancelled","reason":"Replaced by T-40"}\`.
   A reason is required. Cancelled counts as finished for the feature's progress; untick nothing, add nothing.
7. **Done**: tick the item's own verified checks and close it in one call:
   \`{"check_ac":[1,2],"final_summary":"…","modified_files":["…"],"status":"Done"}\`, then tick the feature's check
   for that child (\`{"check_ac":[n]}\`). The feature never closes by itself: when every child is Done or Cancelled,
   close it the same way (\`final_summary\` + \`"status":"Done"\`).
8. **Screenshots** are optional and not the default. Attach one only when a picture explains something better than
   words (a visual bug, a layout before/after, an error dialog). PNG/JPEG/WebP/GIF, up to 3 MB, with a caption:
   \`\`\`bash
   curl -s -X POST ${api}/tasks/T-12.1/attachments ${H} -F file=@shot.png -F caption="Header overlaps the menu at 1280px"
   curl -s ${api}/tasks/T-12.1/attachments/7 ${H} -o shot.png     # read one back (ids are in GET /tasks/{ref})
   \`\`\`
9. **Deployments** (only for work that ships code). Done means the work is finished; it does not mean it is live.
   - Creating or starting an item that changes code which gets deployed: send \`"deployable": true\`. Writing,
     research, planning and setup that never deploys stays plain (leave it out).
   - When a deploy actually goes out and you have seen it succeed (CI passed, the URL serves the change), record it,
     with every item that deploy shipped. Environments: Development (dev, preview, staging) and Production
     (\`GET /settings\` → \`environments\`). Never record a deploy you only expect to happen.
   \`\`\`bash
   curl -s -X POST ${api}/deployments ${H} ${J} -d '{"environment":"Production","refs":["T-12.1","T-12.2"],"version":"<commit sha>","url":"https://<the live url>"}'
   curl -s -X POST ${api}/deployments ${H} ${J} -d '{"environment":"Development","refs":["T-12"],"include_children":true,"version":"<sha>"}'
   curl -s -X POST ${api}/tasks/T-12.1/rollback ${H} ${J} -d '{"environment":"Production","note":"Reverted: broke checkout"}'
   curl -s "${api}/tasks?status=Done&not_deployed_to=Production" ${H}     # finished but not live yet
   \`\`\`
   If the owner deploys (you cannot push), close the item as Done and say it still needs a deploy; record it once
   the owner confirms it is live.
10. **Minor**: once the tweak is done,
   \`curl -s -X POST ${api}/tasks ${H} ${J} -d '{"title":"…","type":"minor","status":"Done","final_summary":"…"}'\`
   then \`curl -s -X POST ${api}/tasks/T-NN/archive ${H}\`.
11. **Mention refs** (e.g. "Tracked as T-12, T-12.1") in your replies to the owner.

## 3. Endpoints

Body and query keys work in snake_case or camelCase; response keys are always camelCase. Refs are global: \`T-12\`, \`T-12.3\`, \`M-3\`, \`DOC-3\`, \`DEC-3\`.
Errors: \`{"error":{"code","message"}}\` with 400 invalid, 401 bad token, 404 not found / not yours, 409 conflict.

Tasks
- \`GET /tasks\` filters: \`q\`, \`status\`, \`exclude_status\`, \`type\`, \`labels\`, \`priority\`, \`assignee\`,
  \`milestone\`, \`parent\`, \`top_level_only\`, \`include_archived\`, \`archived_only\`, \`drafts=exclude|include|only\`,
  \`deployable=true|false\`, \`deployed_to=<env>\`, \`not_deployed_to=<env>\`,
  \`sort\`, \`order\`, \`limit\`, \`offset\` → \`{items,total}\`
- \`POST /tasks\` \`{title, type?, parent?, status?, reason?, priority?, labels?, assignees?, milestone?, due_date?,
  description?, plan?, notes?, final_summary?, references?, documentation?, modified_files?,
  acceptance_criteria?, definition_of_done?, depends_on?, is_draft?, deployable?}\`
- \`GET /tasks/{ref}\` full task (checklists, children, dependencies, comments, statusHistory, attachments,
  deployable, deployments, deployHistory, activity)
- \`PATCH /tasks/{ref}\` any field (\`status\` + \`reason\`; \`reason\` alone updates it), plus \`add_ac\`, \`check_ac\`, \`uncheck_ac\`, \`remove_ac\`, \`edit_ac\` [{index,text}],
  \`set_ac\`, \`reorder_ac\` (same for \`_dod\`), \`append_notes\`, \`append_plan\`, \`add_labels\`, \`remove_labels\`,
  \`add_deps\`, \`remove_deps\`, \`parent\` (ref or null)
- \`POST /tasks/{ref}/archive|restore|promote|demote\`, \`GET|POST /tasks/{ref}/comments\` \`{body}\`
- \`GET /tasks/{ref}/history\` the status trail: \`[{from,to,reason,actor,createdAt}]\`, oldest first
- \`POST /deployments\` \`{environment, refs, version?, url?, note?, include_children?}\` · \`GET /deployments?environment=&limit=\`
  (recent deploys, newest first) · \`POST /tasks/{ref}/deploy\` \`{environment, version?, url?, note?}\` ·
  \`POST /tasks/{ref}/rollback\` \`{environment, note?}\` · \`GET /tasks/{ref}/deployments\` (current + history)
- \`GET|POST /tasks/{ref}/attachments\` (multipart \`file\` + \`caption\`, or JSON \`{data_base64, filename?, caption?}\`),
  \`GET|PATCH|DELETE /tasks/{ref}/attachments/{id}\` (GET returns the image; PATCH \`{caption}\`)
- \`DELETE /tasks/{ref}\` (archived only), \`POST /tasks/move\` \`{ref, status?, reason?, before_ref?, after_ref?}\`,
  \`POST /tasks/cleanup\` \`{older_than_days}\` (archives Done and Cancelled)
- Statuses: To Do, In Progress, Blocked, Done, Cancelled. Blocked and Cancelled need a \`reason\`
  (\`GET /settings\` has the live list: \`reason_statuses\`, \`closed_statuses\`). Blocked work: \`GET /tasks?status=Blocked\`

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
