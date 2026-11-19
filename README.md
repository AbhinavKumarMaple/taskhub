# Taskhub

A hosted task tracker for one person and the AI chats working for them: a Kanban board, task details with
acceptance criteria and Definition of Done, drafts, milestones, documents, decisions, statistics and an
activity log. It runs on Next.js with Postgres, so it deploys to Vercel.

Work is split into **Spaces**. Each Space has a key (`sk_…`). A chat connects with the shared agent token and
can only see the Spaces whose keys it passes. Give a chat another Space's key to let it see that work too.
You, the owner, sign into the web app and see every Space.

- Web app: board, lists, task sheet, ⌘K search, light and dark themes.
- REST API under `/api/v1` (see [docs/API.md](docs/API.md)).
- MCP server at `/api/mcp` (Streamable HTTP) with 30 tools for chats.
- The full feature contract is [docs/SPEC.md](docs/SPEC.md).

## Run it locally

```bash
npm i
npm run db:seed   # optional: two demo Spaces with tasks, a milestone, a document and a decision
npm run dev       # http://localhost:3100
```

Sign in with the password `dev`. With no `DATABASE_URL`, data lives in an embedded Postgres (PGlite) under
`.data/pglite`; delete that folder to start fresh. Local dev defaults: `OWNER_PASSWORD=dev`,
`AGENT_TOKEN=dev-token`, `SESSION_SECRET=dev-secret`.

Checks:

```bash
npx tsc --noEmit
npm run lint
npm test            # service, REST and MCP tests on in-memory PGlite
npm run build
npm run smoke:mcp   # needs a running server; TASKHUB_URL and AGENT_TOKEN override the defaults
```

## Deploy to Vercel with Neon

1. Create a Neon project (or add Neon from the Vercel Marketplace) and copy its connection string.
2. Apply the schema once from your machine:
   ```bash
   DATABASE_URL="postgres://…" npm run db:migrate
   ```
3. Import the repository in Vercel (framework preset: Next.js).
4. Set these environment variables for Production (and Preview if you use it):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `OWNER_PASSWORD` | the password you sign in with |
   | `AGENT_TOKEN` | a long random string chats send as `Authorization: Bearer …` |
   | `SESSION_SECRET` | a long random string used to sign the session cookie |

   Generate random values with `openssl rand -base64 32`. In production a missing variable makes the
   affected routes refuse to run with a clear error instead of falling back to the dev defaults.
5. Deploy, open the site and sign in.
6. Optional: `DATABASE_URL="postgres://…" npm run db:seed` for demo data.

## Connect Claude

Open **Connect** in the app: it shows the commands with your host filled in and the token behind a reveal
button. For Claude Code:

```bash
claude mcp add --transport http taskhub https://<host>/api/mcp --header "Authorization: Bearer <AGENT_TOKEN>"
```

Then, in a chat: "Create a Taskhub Space called *my project* and remember its key." The chat gets the key back
from `space_create` and passes it as `space_key` on later calls (or set an `X-Space-Key` header in the MCP
config). To share work between chats, copy a key from the **Spaces** page and give it to the other chat.
Regenerating a key cuts off every chat holding the old one.

The Connect page also has the tracking rules text to paste into a global `CLAUDE.md`, so every chat keeps its
tasks up to date the same way.

claude.ai web connectors need OAuth, which Taskhub does not offer yet; use clients that can send a custom
header (Claude Code, or any MCP client configured with JSON).
