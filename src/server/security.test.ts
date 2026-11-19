/**
 * Regression tests for the security review: each block pins one fix so it cannot silently come back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as svc from "./service";
import type { Access } from "@/lib/types";
import { accessFromKeys, getAgentAccess } from "./auth";
import { authEnv, createSessionToken, missingAuthEnv, safeNext, verifySessionToken } from "./session";
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from "./service/login-limit";
import { makeSpace, OWNER, setupTestDb } from "./service/test-helpers";
import { GET as logoutGet, POST as logoutPost } from "@/app/logout/route";

setupTestDb();

afterEach(() => {
  vi.unstubAllEnvs();
});

const DEFAULT = "/board?type=feature";

describe("1. post-login redirect stays on this site", () => {
  it("refuses control characters, backslashes and other-origin paths", () => {
    for (const bad of [
      "/\t/evil.example/x",
      "/\n/evil.example",
      "/\r/evil.example",
      "/ /evil.example",
      "/\\evil.example",
      "/%09/x\\y",
      "//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "",
    ]) {
      const out = safeNext(bad);
      expect(out, JSON.stringify(bad)).toBe(DEFAULT);
    }
    // Whatever survives must resolve to this origin in a browser.
    for (const ok of ["/tasks?x=1", "/board?type=feature#top", "/tasks/T-1"]) {
      const out = safeNext(ok);
      expect(out).toBe(ok);
      expect(new URL(out, "https://taskhub.test").origin).toBe("https://taskhub.test");
    }
  });
});

describe("2. Space names cannot be probed by a chat", () => {
  it("lets a chat use a name only hidden Spaces have, and still blocks duplicates it can see", async () => {
    await makeSpace("Secret PROJECT");
    const mine = await makeSpace("Chat own");
    const chat: Access = { actor: "chat", spaces: [mine.space.id] };
    const created = await svc.createSpace(chat, { name: "secret project" });
    expect(created.name).toBe("secret project");
    await expect(svc.updateSpace(chat, mine.space.id, { name: "SECRET project" })).resolves.toMatchObject({
      name: "SECRET project",
    });
    const both: Access = { actor: "chat", spaces: [mine.space.id, created.id] };
    await expect(svc.createSpace(both, { name: "Secret Project" })).rejects.toMatchObject({ code: "conflict" });
    // The owner sees every Space, so the owner still gets the conflict.
    await expect(svc.createSpace(OWNER, { name: "secret PROJECT" })).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("3. board order is kept per Space", () => {
  it("never reads or renumbers another Space's card positions", async () => {
    const A = await makeSpace("Order A");
    const B = await makeSpace("Order B");
    const b1 = await svc.createTask(B.chat, { title: "b1" });
    const a1 = await svc.createTask(OWNER, { spaceId: A.space.id, title: "a1" });
    const b2 = await svc.createTask(B.chat, { title: "b2" });
    const a1Before = (await svc.getTask(OWNER, a1.ref)).ordinal;

    // New cards are placed after the Space's own cards only (a1 does not push b2 further down).
    expect(b2.ordinal - b1.ordinal).toBe(1024);

    // Moving b1 before b2 gives the midpoint of B's own cards, not one with A's hidden card.
    const moved = await svc.moveTask(B.chat, { ref: b1.ref, beforeRef: b2.ref });
    expect(moved.ordinal).toBeLessThan(b2.ordinal);
    expect(moved.ordinal).not.toBe((a1Before + b2.ordinal) / 2);

    // Forcing a renumber in B leaves A's card untouched.
    await svc.moveTask(B.chat, { ref: b1.ref, ordinal: a1Before + 1e-7 });
    await svc.moveTask(B.chat, { ref: b2.ref, ordinal: a1Before + 2e-7 });
    await svc.moveTask(B.chat, { ref: b2.ref, beforeRef: b1.ref });
    expect((await svc.getTask(OWNER, a1.ref)).ordinal).toBe(a1Before);
    const aLog = await svc.listActivity(OWNER, { spaceId: A.space.id });
    expect(aLog.items.filter((r) => r.entityRef === a1.ref).map((r) => r.action)).toEqual(["created"]);
  });
});

describe("4. a chat cannot record itself as the owner", () => {
  it("rewrites the reserved actor name for agent access", async () => {
    const { space } = await makeSpace("Actor");
    expect((await accessFromKeys([space.key], "owner")).actor).toBe("chat:owner");
    expect((await accessFromKeys([space.key], " OWNER ")).actor).toBe("chat:OWNER");
    expect((await accessFromKeys([space.key], "claude")).actor).toBe("claude");
    const req = new Request("http://x/api/mcp", {
      headers: { authorization: "Bearer dev-token", "x-space-key": space.key, "x-actor": "Owner" },
    });
    const access = await getAgentAccess(req);
    expect(access.actor).toBe("chat:Owner");
    const t = await svc.createTask(access, { title: "x" });
    const c = await svc.addComment(access, t.ref, { body: "approved" });
    expect(c.author).toBe("chat:Owner");
    expect((await svc.getTask(OWNER, t.ref)).activity.every((a) => a.actor !== "owner")).toBe(true);
  });
});

describe("5. owner sign-in is rate limited", () => {
  it("locks a client out after repeated failures, per client, until the window passes", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) await svc.recordLoginFailure("1.2.3.4", t0);
    expect(await svc.loginRetryAfter("1.2.3.4", t0)).toBe(0);
    await svc.recordLoginFailure("1.2.3.4", t0);
    expect(await svc.loginRetryAfter("1.2.3.4", t0)).toBeGreaterThan(0);
    expect(await svc.loginRetryAfter("5.6.7.8", t0)).toBe(0);
    const later = new Date(t0.getTime() + LOGIN_WINDOW_MS + 1000);
    expect(await svc.loginRetryAfter("1.2.3.4", later)).toBe(0);
    // A failure after the window starts a new count.
    await svc.recordLoginFailure("1.2.3.4", later);
    expect(await svc.loginRetryAfter("1.2.3.4", later)).toBe(0);
    await svc.clearLoginFailures("1.2.3.4");
  });

  it("refuses short secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OWNER_PASSWORD", "short");
    vi.stubEnv("AGENT_TOKEN", "x".repeat(32));
    vi.stubEnv("SESSION_SECRET", "y".repeat(32));
    expect(() => authEnv("OWNER_PASSWORD")).toThrow(/too short/);
    expect(missingAuthEnv()).toEqual(["OWNER_PASSWORD (at least 12 characters)"]);
    vi.stubEnv("OWNER_PASSWORD", "a long enough password");
    expect(missingAuthEnv()).toEqual([]);
  });
});

describe("6. task history after a Space move", () => {
  it("hides activity recorded in the old Space from a chat holding only the new one", async () => {
    const A = await makeSpace("History A");
    const B = await makeSpace("History B");
    const t = await svc.createTask(OWNER, { spaceId: A.space.id, title: "moving", description: "secret A" });
    await svc.updateTask(OWNER, t.ref, { description: "secret A v2" });
    await svc.updateTask(OWNER, t.ref, { spaceId: B.space.id });
    const seen = await svc.getTask(B.chat, t.ref);
    expect(seen.activity.length).toBeGreaterThan(0);
    expect(seen.activity.every((a) => a.spaceId === B.space.id)).toBe(true);
    expect(JSON.stringify(seen.activity)).not.toContain("secret A");
    // The owner still sees the whole history.
    expect((await svc.getTask(OWNER, t.ref)).activity.some((a) => a.spaceId === A.space.id)).toBe(true);
  });
});

describe("hardening", () => {
  it("an archived Space's key stops working until it is restored", async () => {
    const { space } = await makeSpace("Archived key");
    expect(await svc.resolveKeys([space.key])).toEqual([space.id]);
    await svc.archiveSpace(OWNER, space.id);
    expect(await svc.resolveKeys([space.key])).toEqual([]);
    await svc.restoreSpace(OWNER, space.id);
    expect(await svc.resolveKeys([space.key])).toEqual([space.id]);
  });

  it("changing OWNER_PASSWORD signs existing sessions out", () => {
    vi.stubEnv("OWNER_PASSWORD", "first password");
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    vi.stubEnv("OWNER_PASSWORD", "second password");
    expect(verifySessionToken(token)).toBe(false);
  });

  it("GET /logout does not sign out; a cross-site POST is refused", async () => {
    const get = logoutGet(new NextRequest("http://localhost:3100/logout"));
    expect(get.headers.get("set-cookie")).toBeNull();
    const cross = logoutPost(
      new NextRequest("http://localhost:3100/logout", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "localhost:3100" },
      }),
    );
    expect(cross.status).toBe(403);
    const same = logoutPost(
      new NextRequest("http://localhost:3100/logout", {
        method: "POST",
        headers: { origin: "http://localhost:3100", host: "localhost:3100" },
      }),
    );
    expect(same.status).toBe(303);
    expect(same.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
