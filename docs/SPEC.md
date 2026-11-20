# Taskhub — specification

A hosted task tracker for one person and the AI chats working for them. It is a Next.js re-build of
Backlog.md (every feature it has, listed below), with a Postgres database instead of markdown files, so it
runs on Vercel. Private project. Never mention any company or client in code, seed data or copy.

## Concepts

- **Owner**: the human. Signs into the web app with `OWNER_PASSWORD`. Sees and edits every Space.
- **Space**: a board of work, e.g. "recipe site", "home server", or one chat's own work. Has
  - `id` `sp_` + 10 random base32 chars (shown in URLs and UI),
  - `key` `sk_` + 32 random base32 chars — the credential a chat holds. Stored in plain text so the owner can
    copy it from the Spaces page at any time; the owner can regenerate it (old key stops working at once).
- **Chat (agent)**: any AI client. Connects with the single `AGENT_TOKEN` (Bearer). A chat can create a Space
  (it gets the key back) and can read/write ONLY Spaces whose key it passes on that call. Giving a chat another
  Space's key is how the owner shares tasks between chats. There are no user accounts.
- **Actor**: free-text name recorded in the activity log: `owner` for the web app; for chats the `actor` argument
  (MCP) or `X-Actor` header (REST), default `chat`.

## Item kinds (same rules the owner already uses)

| Type | Meaning | Where |
|---|---|---|
| `feature` | a feature or block of work | top level; shown on the main board |
| `sub-feature` | part of a feature | child of a feature |
| `fix` | something broken | child of a feature, or top level |
| `minor` | small tweak | created Done then archived |

Types, statuses, priorities and labels are configurable in Settings; defaults:
statuses `To Do`, `In Progress`, `Done` (the last one is the terminal status); types above; priorities
`High`, `Medium`, `Low`; labels `waiting`. The main view is `/board?type=feature`.

## Data model (Drizzle, Postgres; `src/server/db/schema.ts`)

- `settings` (single row id=1): `statuses text[]`, `defaultStatus`, `types text[]`, `priorities text[]`,
  `labels text[]`, `dodDefaults text[]` (Definition-of-Done items added to new tasks), `updatedAt`.
- `spaces`: `id`, `name` (unique, ignoring case, among the Spaces the caller can see: all of them for the owner,
  the held keys for a chat, so a chat cannot probe hidden names), `description`, `key` (unique), `color` (one of 8 named swatches),
  `createdAt`, `archivedAt`.
- `tasks`: `id serial`, `ref text unique` (`T-<n>` for top level from a global sequence; a child is
  `<parent ref>.<k>` using the parent's `childCounter`), `spaceId`, `parentId`, `isDraft bool`, `title`,
  `description`, `status`, `type`, `priority`, `labels text[]`, `assignees text[]`, `milestoneId`, `dueDate`,
  `plan`, `notes`, `finalSummary`, `references text[]`, `documentation text[]`, `modifiedFiles text[]`,
  `ordinal double` (manual order inside a column, kept per Space so one Space's moves never read or renumber
  another's), `childCounter int`, `createdAt`, `updatedAt`, `archivedAt`.
  A child always lives in its parent's Space. Changing the parent gives the task (and its subtasks) new refs.
- `checklist_items`: `id`, `taskId`, `list` (`ac` | `dod`), `text`, `checked`, `position`.
- `task_dependencies`: (`taskId`, `dependsOnId`) — same Space only; reject self and cycles.
- `comments`: `id`, `taskId`, `author`, `body`, `createdAt`.
- `milestones`: `id`, `ref` (`M-<n>`), `spaceId`, `title`, `description`, `dueDate`, `createdAt`, `archivedAt`.
- `documents`: `id`, `ref` (`DOC-<n>`), `spaceId`, `title`, `body` (markdown), `createdAt`, `updatedAt`, `archivedAt`.
- `decisions`: `id`, `ref` (`DEC-<n>`), `spaceId`, `title`, `status` (`proposed|accepted|rejected|superseded`),
  `context`, `decision`, `consequences`, `createdAt`, `updatedAt`, `archivedAt`.
- `login_failures`: `client` (IP), `count`, `windowStart` — the owner sign-in rate limit (10 per 15 min).
- `activity`: `id`, `spaceId`, `entityType` (`task|milestone|document|decision|space|settings`), `entityRef`,
  `action` (`created|updated|status|archived|restored|deleted|commented|promoted|demoted|moved`), `actor`,
  `summary` (one human sentence), `changes jsonb` (field → {from,to}), `createdAt`. This replaces git history:
  every write records one row. Deleting a task keeps its activity rows.

Refs are unique across the whole database, so "T-12" means one task everywhere.

## Database drivers (`src/server/db/index.ts`)

- `DATABASE_URL` set → Neon (`drizzle-orm/neon-serverless` Pool, so transactions work) — production on Vercel.
- Not set → PGlite persisted at `.data/pglite` (gitignored) — local dev and tests (tests use in-memory PGlite).
- Migrations from `drizzle-kit generate` live in `drizzle/`. `npm run db:migrate` applies them to either driver;
  local PGlite also auto-migrates on first connection. `npm run db:seed` creates demo data (2 Spaces, features
  with sub-features, fixes, a minor archived item, a milestone, a doc, a decision) — neutral demo content only.

## Service layer (`src/server/service/*`) — the ONLY code that touches the database

Every function takes an `Access` first: `{ actor: string; spaces: 'all' | string[] /* allowed space ids */ }`
and throws `NotFound` for anything outside its Spaces (never reveal existence). Inputs are validated with zod
schemas in `src/server/validation.ts`. Errors are typed (`NotFound`, `Invalid`, `Conflict`). Every write runs in a
transaction and appends an `activity` row. Web server actions, REST routes and MCP tools all call these same
functions — no duplicated logic.

Required operations (names are a guide; keep them consistent):
- spaces: `createSpace`, `listSpaces`, `getSpace`, `updateSpace`, `regenerateKey`, `archiveSpace`,
  `restoreSpace`, `resolveKeys(keys[]) → space ids`.
- tasks: `createTask` (incl. parent, draft, ACs, DoD defaults unless `noDodDefaults`, deps, all fields),
  `listTasks` (filters: spaces, status, excludeStatus, type, label (all of), priority, assignee, milestone,
  parent, topLevelOnly, search text, includeArchived/archivedOnly, drafts; sort; limit/offset; returns AC
  progress `acDone/acTotal`, child counts by status), `getTask` (full: checklists, children, deps both ways
  incl. transitive, comments, activity), `updateTask` (any field; ops `addAc`, `checkAc`, `uncheckAc`,
  `removeAc`, `editAc`, `setAc` (replace list keeping checks on identical text), same for DoD; `appendNotes`,
  `appendPlan`, `addLabels`, `removeLabels`, `addDeps`, `removeDeps`), `moveTask` (status + ordinal, for
  drag and drop), `reorderTasks`, `archiveTask`, `restoreTask`, `deleteTask` (only archived; children must be
  deleted first), `promoteDraft`, `demoteTask`, `cleanupDone(olderThanDays)` (archives Done tasks),
  `addComment`, `exportBoardMarkdown(filters)`.
- milestones, documents, decisions: create, list, get, update, archive, restore.
- `search(access, q, {types})` across tasks (ref, title, description, notes), documents and decisions — Postgres
  `ILIKE` per word, every word must match in any order (word order must not matter), ranked title > body.
- `statistics(access, filters)`: counts by status/type/priority, completion %, created/completed per week
  (last 8 weeks), oldest open items, waiting items.
- `listActivity(access, {spaceId?, entityRef?, limit, before})`.
- settings: `getSettings`, `updateSettings` (renaming a status/type/label migrates existing tasks; removing one
  still in use is rejected with `Conflict`).

## Auth (`src/server/auth.ts`, `src/proxy.ts` — Next 16 renamed middleware to proxy; read the docs)

- Owner: `/login` posts the password; compare in constant time with `OWNER_PASSWORD`; set an httpOnly,
  sameSite=lax, secure-in-production cookie holding an HMAC-signed (with `SESSION_SECRET`) expiry. 30 days.
  `/logout`. All pages except `/login` require it.
- Agents: `Authorization: Bearer <AGENT_TOKEN>` on `/api/v1/*` and `/api/mcp`. Space keys come from the
  `X-Space-Key` header (comma-separated allowed) or a `space_key` argument. The owner cookie also works on
  `/api/v1/*` with `spaces: 'all'`. An archived Space's key stops working until it is restored. A chat may not
  record itself as `owner` (it becomes `chat:owner`). A task's activity is shown only from Spaces the caller holds.
- Hardening: the post-login `next` must be a same-origin path; 10 failed sign-ins per IP lock sign-in for 15
  minutes; the session HMAC includes a hash of `OWNER_PASSWORD` (changing it signs everyone out); `/logout` is
  POST-only and same-origin; pages send `X-Frame-Options: DENY` / `frame-ancestors 'none'`.
- Dev defaults when env vars are unset and `NODE_ENV !== 'production'`: `OWNER_PASSWORD=dev`,
  `AGENT_TOKEN=dev-token`, `SESSION_SECRET=dev-secret`. In production, missing vars (or `OWNER_PASSWORD` under
  12 characters, `AGENT_TOKEN`/`SESSION_SECRET` under 32) make the app refuse to start those routes with a clear
  error, and a missing `DATABASE_URL` is an error (set `PGLITE_DIR` to use local PGlite on purpose).

## HTTP API (`src/app/api/v1/**`) — JSON, documented in `docs/API.md`

`POST /spaces` (create; returns key) · `GET /spaces` (the key's Spaces) · `GET /tasks` (filters as query
params) · `POST /tasks` · `GET|PATCH|DELETE /tasks/{ref}` · `POST /tasks/{ref}/archive|restore|promote|demote|comments`
· `POST /tasks/move` · `GET /search?q=` · `GET|POST /milestones`, `/documents`, `/decisions` and `/{ref}` variants
· `GET /statistics` · `GET /activity` · `GET /board.md` (markdown export). Errors: `{error:{code,message}}` with
401/404/400/409.

## MCP endpoint (`src/app/api/[transport]/route.ts` via `mcp-handler`, Streamable HTTP at `/api/mcp`)

Tools (snake_case, every tool except `space_create` and `instructions` takes `space_key`; optional `actor`):
`instructions` (returns the tracking rules text from `src/server/instructions.ts`), `space_create`,
`space_info`, `task_create`, `task_list`, `task_view`, `task_edit`, `task_move`, `task_archive`,
`task_restore`, `task_delete`, `draft_create`, `draft_promote`, `task_demote`, `task_comment`, `search`,
`board` (columns with cards, text), `milestone_create|list|edit`, `doc_create|list|view|edit`,
`decision_create|list|view|edit`, `activity`, `statistics`. Tool results are concise text plus structured
JSON. Claude Code connects with:
`claude mcp add --transport http taskhub https://<host>/api/mcp --header "Authorization: Bearer <AGENT_TOKEN>"`.

## Web app pages (App Router, `src/app/(app)/*`; read Next 16 docs for cacheComponents / dynamic rendering)

Shell: left sidebar (app name, Space switcher "All Spaces" + each Space with its colour dot, nav: Board, All
tasks, Drafts, Archive, Milestones, Documents, Decisions, Statistics, Activity, Spaces, Settings, Connect),
counts beside nav items, ⌘K search palette, light/dark toggle (system default, remembered), sign out. The
selected Space is the `space` query param, kept across nav links.

- `/board` — Kanban, one column per status; filters in the URL (`space`, `type`, `label`, `priority`,
  `assignee`, `milestone`, `q`); default redirect from `/` is `/board?type=feature`. Card: ref, type chip, Space
  chip (colour), labels (`waiting` styled amber), AC progress `n/m` with a small ring, child progress for
  features, priority marker, assignees, updated date. Drag and drop between columns and within a column
  (@dnd-kit, optimistic, persisted via `moveTask`). Group-by-milestone toggle (swimlanes). Column menu: add
  task, clean up Done older than N days. "Export markdown" button. Auto-refresh: poll every 5 s while visible
  (cheap version endpoint), no flicker. Clicking a card opens the task in a right-hand sheet (`?task=T-12`).
- Task detail (sheet and `/tasks/[ref]` full page, one component): editable title; status, type, priority,
  Space (top-level only), parent, milestone, due date, assignees, labels; description, plan, notes, final
  summary as markdown with edit/preview; acceptance criteria and Definition of Done checklists (add, edit
  inline, check, reorder by drag, delete); subtasks list with status chips and "3 of 5 complete" and
  "add sub-feature/fix"; dependencies (depends on / blocks, add by ref search, transitive shown indented);
  references, documentation links, modified files (add/remove); comments; activity timeline with field diffs;
  actions: archive/restore, delete (archived only, confirm), demote to draft / promote, copy ref, copy link.
- `/tasks` — table with sortable columns (ref, title, status, type, priority, Space, labels, assignee,
  milestone, AC, updated), filters incl. status multi-select and exclude-status, text search, pagination 50.
- `/drafts` — list, create, promote, edit (opens task sheet).
- `/archive` — archived tasks (and docs/decisions/milestones tabs), restore, delete forever (confirm).
- `/milestones` — list with progress bars; create/edit/archive; board grouping uses them.
- `/documents`, `/documents/[ref]` — markdown docs per Space, create/edit/preview/archive.
- `/decisions`, `/decisions/[ref]` — ADR-style (status chip, context, decision, consequences), create/edit.
- `/statistics` — totals, by status/type/priority (bars), completion %, weekly created vs completed (last 8
  weeks), waiting items, oldest open items.
- `/activity` — global timeline, filter by Space and actor, infinite "load more".
- `/spaces` — create Space (name, colour, description); each row shows id, key (masked, copy button, reveal),
  regenerate key (confirm), rename, archive/restore, task counts.
- `/settings` — edit statuses (order = board columns), types, priorities, labels, DoD defaults; rename safely.
- `/connect` — how to connect a chat: the `claude mcp add …` command with the host filled in (token masked
  with reveal/copy), REST `curl` examples, and the tracking rules text (from `instructions.ts`) with a copy
  button to paste into a global CLAUDE.md.

## Look and feel

Calm, dense, professional; Inter (next/font), neutral greys with one blue accent; status colours: To Do grey,
In Progress blue, Done green; `waiting` amber. 8 px radius, hairline borders, no heavy shadows. Both themes via
CSS variables on `:root` / `.dark`. Loading states are still blocks that breathe (`animate-pulse`), never a
moving shimmer. Empty states say what to do next. Every interactive element is keyboard reachable with a
visible focus ring. Works at 1440 px and down to 768 px (sidebar collapses).

## Quality bar

- `npx tsc --noEmit`, `npm run lint`, `npm test` (vitest; service + API + MCP tests on in-memory PGlite) and
  `npm run build` all pass.
- Access control is tested: a chat with key A can never read, list, search, count or modify Space B.
- README.md: what it is, local run (`npm i && npm run dev`, sign in with `dev`), deploy to Vercel + Neon
  step by step (env vars `DATABASE_URL`, `OWNER_PASSWORD`, `AGENT_TOKEN`, `SESSION_SECRET`), connect Claude.
