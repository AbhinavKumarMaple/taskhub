/**
 * Apply drizzle/ migrations to Neon (DATABASE_URL) or local PGlite (.data/pglite).
 *   npm run db:migrate
 */
import path from "node:path";
import { createPgliteDb, MIGRATIONS_FOLDER } from "../src/server/db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
    await pool.end();
    console.log("Migrated Neon database.");
  } else {
    const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    const { close } = await createPgliteDb(dir); // migrates on connect
    await close();
    console.log(`Migrated PGlite at ${dir}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
