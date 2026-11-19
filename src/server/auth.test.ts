import { describe, expect, it } from "vitest";
import { getAgentAccess, getApiAccess } from "./auth";
import {
  checkAgentToken,
  checkOwnerPassword,
  createSessionToken,
  safeNext,
  SESSION_COOKIE,
  splitKeys,
  verifySessionToken,
} from "./session";
import { makeSpace, setupTestDb } from "./service/test-helpers";

setupTestDb();

describe("session primitives (dev defaults)", () => {
  it("signs and verifies expiring session tokens", () => {
    const t = createSessionToken();
    expect(verifySessionToken(t)).toBe(true);
    expect(verifySessionToken(t + "x")).toBe(false);
    expect(verifySessionToken(t.replace(/^\d+/, String(Date.now() + 1e12)))).toBe(false);
    expect(verifySessionToken(createSessionToken(Date.now() - 31 * 86_400_000))).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken("abc")).toBe(false);
  });

  it("checks password and agent token", () => {
    expect(checkOwnerPassword("dev")).toBe(true);
    expect(checkOwnerPassword("nope")).toBe(false);
    expect(checkAgentToken("Bearer dev-token")).toBe(true);
    expect(checkAgentToken("bearer dev-token")).toBe(true);
    expect(checkAgentToken("Bearer other")).toBe(false);
    expect(checkAgentToken(null)).toBe(false);
  });

  it("splits keys and sanitises next", () => {
    expect(splitKeys("a, b", ["c"], null)).toEqual(["a", "b", "c"]);
    expect(safeNext("/tasks?x=1")).toBe("/tasks?x=1");
    expect(safeNext("//evil.com")).toBe("/board?type=feature");
    expect(safeNext("https://evil.com")).toBe("/board?type=feature");
  });
});

describe("request access", () => {
  it("resolves agent access from bearer + X-Space-Key + extra keys", async () => {
    const A = await makeSpace();
    const B = await makeSpace();
    const req = new Request("http://x/api/v1/tasks", {
      headers: { authorization: "Bearer dev-token", "x-space-key": A.space.key, "x-actor": "bot" },
    });
    expect(await getAgentAccess(req)).toEqual({ actor: "bot", spaces: [A.space.id] });
    const both = await getAgentAccess(req, { spaceKeys: B.space.key });
    expect([...(both.spaces as string[])].sort()).toEqual([A.space.id, B.space.id].sort());
    await expect(getAgentAccess(new Request("http://x"))).rejects.toMatchObject({ status: 401 });
  });

  it("owner cookie works on the API with all Spaces", async () => {
    const req = new Request("http://x/api/v1/tasks", {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${encodeURIComponent(createSessionToken())}` },
    });
    expect(await getApiAccess(req)).toEqual({ actor: "owner", spaces: "all" });
    await expect(getApiAccess(new Request("http://x", { headers: { cookie: `${SESSION_COOKIE}=bad` } }))).rejects.toMatchObject({
      status: 401,
    });
  });
});
