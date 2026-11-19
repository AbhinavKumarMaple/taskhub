import { afterAll, beforeAll } from "vitest";
import { closeDb, createTestDb, setDb } from "../db";
import type { Access } from "@/lib/types";
import { createSpace } from "./spaces";

export const OWNER: Access = { actor: "owner", spaces: "all" };

/** Fresh in-memory PGlite for the current test file. */
export function setupTestDb() {
  beforeAll(async () => {
    const { db, close } = await createTestDb();
    setDb(db, close);
  });
  afterAll(async () => {
    await closeDb();
  });
}

let n = 0;
/** Creates a Space and returns it with a chat Access scoped to it. */
export async function makeSpace(name = `space ${++n}`) {
  const space = await createSpace(OWNER, { name });
  const chat: Access = { actor: "chat", spaces: [space.id] };
  return { space, chat };
}
