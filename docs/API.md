# Taskhub API

Two ways in, both backed by the same service layer:

- **REST**: JSON at `/api/v1/*`.
- **MCP**: Streamable HTTP at `/api/mcp`, for Claude Code and other MCP clients.

## Auth and Spaces

| Header | Meaning |
|---|---|
| `Authorization: Bearer <AGENT_TOKEN>` | Required for chats, on every call. One token is shared by every chat. |
| `X-Space-Key: sk_…` | The Spaces this call may touch. Comma-separate several keys. You can also pass them as the `space_key` query param (REST) or tool argument (MCP); prefer the header, since URLs end up in logs. An archived Space's key does not work until the owner restores it. |
| `X-Actor: <name>` | The name written to the activity log. Default `chat`. On MCP, the `actor` tool argument does the same. `owner` is reserved for the web app; a chat asking for it is recorded as `chat:owner`. |

- **Owner cookie.** The owner's session cookie also works on `/api/v1/*`. It sees every Space and logs as `owner`.
- **No key.** A token with no valid key sees no Spaces. It can still create one: `POST /spaces` or `space_create`.
- **Keys are the only scope.** Anything outside the caller's Spaces returns **404**, never 403, so its existence is never revealed. Lists, search, statistics, activity and the board export leave those Spaces out without saying so.
- **Sharing.** To let a chat see another chat's tasks, give it that Space's key as well (`X-Space-Key: sk_a,sk_b`).

Refs are global and case-insensitive: `T-12`, `T-12.3`, `M-3`, `DOC-3`, `DEC-3`.

### Errors

```json
{ "error": { "code": "not_found", "message": "Task not found" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `invalid` | Bad input, bad JSON, or a rule was broken (e.g. deleting a task that isn't archived) |
| 401 | `unauthorized` | The token is missing or wrong |
| 403 | `forbidden` | A chat tried to change settings (owner only) |
| 404 | `not_found` | The item is missing or outside your Spaces |
| 409 | `conflict` | Duplicate Space name, sub-tasks still exist, or the value is still in use |
| 500 | `config` / `internal` | A production env var is missing, or a server error |

## REST: `/api/v1`

- **Field names.** Body and query keys work in camelCase (`acceptanceCriteria`) or snake_case (`acceptance_criteria`).
- **Lists.** Pass list filters comma-separated (`status=To Do,In Progress`) or as repeated params.
- **Dates.** Dates are ISO strings. `dueDate` is `YYYY-MM-DD`.
- **Caching.** Responses are `Cache-Control: no-store`.

### Spaces

| Method | Path | Notes |
|---|---|---|
| GET | `/spaces` | The caller's Spaces with counts and keys. `include_archived=true` |
| POST | `/spaces` | `{name, description?, color?}` → 201 with `key` |
| GET | `/spaces/{id}` | One Space |
| PATCH | `/spaces/{id}` | `{name?, description?, color?}` |

`color` is one of `gray`, `blue`, `green`, `amber`, `red`, `purple`, `pink` or `teal`.

### Tasks

| Method | Path | Notes |
|---|---|---|
| GET | `/tasks` | Filters below → `{items, total}` |
| POST | `/tasks` | Create → 201 (full task) |
| GET | `/tasks/{ref}` | Full task: checklists, children, transitive `dependsOn`/`blocks`, comments, the last 100 activity rows |
| PATCH | `/tasks/{ref}` | Fields and ops below |
| DELETE | `/tasks/{ref}` | Archived tasks only. Delete children first (otherwise 409) |
| POST | `/tasks/{ref}/archive` | Also archives its descendants |
| POST | `/tasks/{ref}/restore` | Restores the descendants archived with it |
| POST | `/tasks/{ref}/promote` | Draft → task |
| POST | `/tasks/{ref}/demote` | Task → draft |
| GET | `/tasks/{ref}/comments` | Comments, oldest first |
| POST | `/tasks/{ref}/comments` | `{body}` → 201. The author is the actor |
| POST | `/tasks/move` | `{ref, status?, beforeRef?, afterRef?, ordinal?}` |
| POST | `/tasks/reorder` | `{refs: [...], status?}`: exactly this order |
| POST | `/tasks/cleanup` | `{olderThanDays, spaces?}`: archives Done tasks → `{archived: [refs]}` |

**Create fields:**

- `title` is required.
- `spaceId` can be left out when your keys open exactly one Space.
- `parent` (a ref) makes the task a child `T-12.k`. A child's type defaults to `sub-feature`.
- `isDraft`, `description`, `status`, `type`, `priority`, `labels[]`, `assignees[]`, `milestone` (`M-3` or null), `dueDate`.
- `plan`, `notes`, `finalSummary`, `references[]`, `documentation[]`, `modifiedFiles[]`.
- `acceptanceCriteria[]`, `definitionOfDone[]`, and `noDodDefaults` (skip the configured DoD items).
- `dependsOn[]`: refs in the same Space.

**Update:**

- Any of the create fields, except `parent`, which is fixed once the task exists.
- `spaceId`, which moves a top-level task and its children.
- `parent`: a task ref in the same Space, or `null` for top level. The task gets a new ref under its new parent
  (`T-3.4`, or a fresh `T-<n>`), its subtasks are renumbered with it, and the response carries the new ref.
- Checklist ops. Item numbers are **1-based**:
  - `addAc[]`, `checkAc[]`, `uncheckAc[]`, `removeAc[]`
  - `editAc[{index, text}]`
  - `setAc[]`: replaces the list; identical texts keep their check
  - `reorderAc[]`: a permutation of the item numbers
  - The same ops exist for `…Dod`.
- `appendNotes`, `appendPlan`, `addLabels[]`, `removeLabels[]`, `addDeps[]`, `removeDeps[]`.

**List filters (query):**

- `space` (a Space id), `status`, `exclude_status`, `type`, `label`/`labels` (all must match), `priority`.
- `assignee`, `milestone` (a ref or `none`), `parent`, `top_level_only`.
- `q`: every word must match, in any order.
- `include_archived`, `archived_only`, `drafts=exclude|include|only`.
- `sort=ordinal|ref|title|status|type|priority|space|milestone|ac|created|updated`, `order=asc|desc`.
- `limit` (default 100, max 1000), `offset`.

### Statuses, reasons and the status trail

Default statuses: To Do, In Progress, **Blocked**, Done, **Cancelled**. Settings hold their roles:
`done_status` (Done), `closed_statuses` (Done, Cancelled: not open, count toward a parent's progress, archived by
cleanup) and `reason_statuses` (Blocked, Cancelled).

- Moving into a reason status needs `reason` (400 without one): `PATCH /tasks/{ref} {"status":"Blocked","reason":"…"}`.
  The same works on `POST /tasks`, `POST /tasks/move` and `POST /tasks/reorder`.
- `{"reason":"…"}` alone updates the current reason. Leaving the status replaces it (an optional reason is kept).
- Every task carries `status_reason` and `status_changed_at`; `GET /tasks/{ref}` adds `statusHistory`, and
  `GET /tasks/{ref}/history` returns just the trail: `[{id, from, to, reason, actor, createdAt}]`, oldest first.
- Blocked work: `GET /tasks?status=Blocked`.

### Screenshots (attachments)

Optional; only when a picture explains something better than words. PNG, JPEG, GIF or WebP (checked from the bytes;
SVG is refused), up to 3 MB each, 20 per task, 300 MB in total. Stored in Postgres; served only to callers holding
the task's Space.

- `POST /tasks/{ref}/attachments`: multipart (`file`, `caption`), JSON `{data_base64, filename?, caption?}`, or a raw
  image body with `?caption=&filename=` → 201 `{id, filename, content_type, size, width, height, caption, url}`
- `GET /tasks/{ref}/attachments` → metadata list · `GET /tasks/{ref}/attachments/{id}` → the image (`?download=1`)
- `PATCH /tasks/{ref}/attachments/{id}` `{caption}` · `DELETE /tasks/{ref}/attachments/{id}`

### Deployments

Done means finished; deployments say where it is live. Settings hold the environments (`environments`, default
Development, Production; renames move existing deploys, removing one still in use is a 409).

- A task that ships code carries `deployable: true` (set it on create or `PATCH`; recording a deploy sets it too).
  Plain tasks stay `false` and show no deploy state.
- `deployments` on every task: `{"Production": {version, url, note, actor, at}, …}`, one entry per environment it is
  live in. A missing environment means not deployed there.
- `POST /deployments` `{environment, refs, version?, url?, note?, include_children?}` records one deploy that shipped
  several tasks (→ 201, their summaries). `include_children` also marks every non-archived descendant.
  `POST /tasks/{ref}/deploy` `{environment, version?, url?, note?}` does the same for one task.
- `POST /tasks/{ref}/rollback` `{environment, note?}` takes the deploy off (400 if it is not deployed there).
- `GET /tasks/{ref}/deployments` → `{deployable, current, history}`; `GET /tasks/{ref}` has `deployHistory`.
- `GET /deployments?environment=&space=&limit=` the deploy log across your Spaces, newest first.
- List filters: `deployable=true|false`, `deployed_to=<env>` (all of several), `not_deployed_to=<env>` (deployable
  but not there yet), e.g. `GET /tasks?status=Done&not_deployed_to=Production`.

### Milestones, documents, decisions

All three share one shape: `{kind}` is `milestones`, `documents` or `decisions`.

| Method | Path | Notes |
|---|---|---|
| GET | `/{kind}` | `space`, `q`, `include_archived`, `archived_only`; decisions also take `status` |
| POST | `/{kind}` | Create → 201 |
| GET | `/{kind}/{ref}` | One item. A milestone includes its tasks |
| PATCH | `/{kind}/{ref}` | Update |
| DELETE | `/{kind}/{ref}` | Archived items only |
| POST | `/{kind}/{ref}/archive`, `/{kind}/{ref}/restore` | |

Fields for each kind:

- **Milestone:** `{spaceId?, title, description?, dueDate?}`
- **Document:** `{spaceId?, title, body?}` (markdown)
- **Decision:** `{spaceId?, title, status?, context?, decision?, consequences?}`, where `status` is `proposed`, `accepted`, `rejected` or `superseded`

### Everything else

| Method | Path | Notes |
|---|---|---|
| GET | `/search?q=` | Searches tasks, documents and decisions. `types=task,document,decision`, `space`, `include_archived`, `limit` (default 50). Ranked: exact ref, then title, then body |
| GET | `/statistics` | `space`. Counts by status, type and priority; completion; created vs completed for the last 8 weeks; oldest open; waiting |
| GET | `/activity` | `space`, `entity_ref`, `actor`, `limit`, `before` (the `nextBefore` of the previous page) → `{items, nextBefore}` |
| GET | `/board.md` | The board as markdown (`text/markdown`). Takes the same filters as `GET /tasks` |
| GET | `/version` | `space`. Returns `{version}`, a cheap marker that changes on every write the caller can see. Poll it every 5 s and refetch only when it changes |
| GET | `/settings` | Statuses (the last one counts as done), types, priorities, labels, DoD defaults |
| PATCH | `/settings` | Owner only. `{statuses?, defaultStatus?, doneStatus?, closedStatuses?, reasonStatuses?, types?, priorities?, labels?, dodDefaults?, environments?, renames?}` |
| GET | `/instructions` | The tracking rules (markdown) |

### Example

```bash
curl -X POST https://<host>/api/v1/tasks -H "Authorization: Bearer $AGENT_TOKEN" -H "X-Space-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Add login","type":"feature","acceptance_criteria":["Owner can sign in"]}'
```

## MCP: `/api/mcp`

```bash
claude mcp add --transport http taskhub https://<host>/api/mcp \
  --header "Authorization: Bearer <AGENT_TOKEN>"
# optional: pin one Space for this client
#   --header "X-Space-Key: sk_…"
```

How the endpoint behaves:

- **Transport.** It is stateless Streamable HTTP. It speaks the 2026-07-28 protocol and the 2025-era protocol.
- **Token.** Without the token, the endpoint answers 401 before any MCP traffic.
- **Instructions.** The server's `instructions` field carries the tracking rules.
- **Space access.** Every tool except `instructions` and `space_create` takes `space_key` (comma-separated for several). It is added to any `X-Space-Key` header.
- **Actor.** Every tool takes an optional `actor`.
- **Results.** Each result is short text plus `structuredContent` (the same JSON as REST; a list comes back as `{items}`).
- **Errors.** Failures come back as `isError` results whose text is `<code>: <message>`, e.g. `not_found: Task not found`.

| Tool | Does |
|---|---|
| `instructions` | The tracking rules |
| `space_create` | `name, description?, color?` → the Space and its key |
| `space_info` | Your Spaces (with counts) plus statuses, types, priorities and labels |
| `task_create` | `title`, `type`, `parent`, `status`, `priority`, `labels`, `assignees`, `milestone`, `due_date`, `description`, `plan`, `notes`, `final_summary`, `references`, `documentation`, `modified_files`, `acceptance_criteria`, `definition_of_done`, `no_dod_defaults`, `depends_on`, `deployable`, `space_id` |
| `draft_create` | Same as `task_create`, but makes a draft |
| `task_list` | The REST list filters, in snake_case. `space_id` filters by Space |
| `task_view` | `ref`: the task as text, with numbered checklists |
| `task_edit` | `ref` plus any field, and the ops `add_ac`, `check_ac`, `uncheck_ac`, `remove_ac`, `edit_ac`, `set_ac`, `reorder_ac` (and `…_dod`), `append_notes`, `append_plan`, `add_labels`, `remove_labels`, `add_deps`, `remove_deps`, `space_id`, `parent` |
| `task_move` | `ref, status?, before_ref?, after_ref?, ordinal?` |
| `task_archive` / `task_restore` / `task_delete` | `ref` |
| `draft_promote` / `task_demote` | `ref` |
| `task_comment` | `ref, body` |
| `task_deploy` | `refs, environment, version?, url?, note?, include_children?` |
| `task_rollback` | `ref, environment, note?` |
| `deployments` | The deploy log: `space_id?, environment?, limit?` |
| `search` | `q, types?, space_id?, include_archived?, limit?` |
| `board` | Columns of cards. `type: "feature"` gives the main board. Also takes `space_id`, `labels`, `priority`, `assignee`, `milestone`, `q` |
| `milestone_create` / `milestone_list` / `milestone_edit` | Edit takes `archived: true/false` to archive or restore |
| `doc_create` / `doc_list` / `doc_view` / `doc_edit` | Same `archived` flag on edit |
| `decision_create` / `decision_list` / `decision_view` / `decision_edit` | Same `archived` flag on edit |
| `activity` | `space_id?, entity_ref?, by?` (actor filter), `limit?, before?` |
| `statistics` | `space_id?` |

### Testing over HTTP

```bash
curl -s https://<host>/api/mcp -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```
