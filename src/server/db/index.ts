import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Driver-neutral Drizzle database (Neon Pool or PGlite). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
/** A transaction handle; same query API as Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type Holder = { promise?: Promise<Db>; close?: () => Promise<void> };
const g = globalThis as unknown as { __taskhubDb?: Holder };
const holder: Holder = (g.__taskhubDb ??= {});

/** Neon (serverless Pool, so transactions work). Migrations are applied by `npm run db:migrate`. */
export async function createNeonDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema }) as unknown as Db;
  return { db, close: () => pool.end() };
}

/**
 * PGlite: persisted when `dataDir` is given (local dev: `.data/pglite`), in-memory otherwise (tests).
 * Always migrates on connect.
 */
export async function createPgliteDb(dataDir?: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const pdb = drizzle({ client, schema });
  await migrate(pdb, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: pdb as unknown as Db, close: () => client.close() };
}

/** Test helper: a fresh, migrated in-memory database. */
export function createTestDb() {
  return createPgliteDb();
}

async function createDefault(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const { db, close } = url
    ? await createNeonDb(url)
    : await createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  holder.close = close;
  return db;
}

/** The process-wide database (cached on globalThis so dev HMR does not reopen PGlite). */
export function getDb(): Promise<Db> {
  if (!holder.promise) {
    holder.promise = createDefault().catch((err) => {
      holder.promise = undefined;
      throw err;
    });
  }
  return holder.promise;
}

/** Replace the process-wide database (tests). */
export function setDb(db: Db, close?: () => Promise<void>) {
  holder.promise = Promise.resolve(db);
  holder.close = close;
}

export async function closeDb() {
  const close = holder.close;
  holder.promise = undefined;
  holder.close = undefined;
  if (close) await close();
}

export { schema };
