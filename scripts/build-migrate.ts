/**
 * Runs before `next build`. On Vercel (or whenever DATABASE_URL is set) it applies pending drizzle/
 * migrations to the database, so a deploy never serves code ahead of its schema. Locally without
 * DATABASE_URL it does nothing (PGlite migrates itself on first connection).
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("build-migrate: no DATABASE_URL, skipping migrations.");
  process.exit(0);
}

const run = spawnSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env: process.env });
process.exit(run.status ?? 1);
