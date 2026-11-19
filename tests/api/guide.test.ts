import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/route";

describe("GET /api/v1 (curl guide)", () => {
  it("returns markdown with this host filled in, no auth needed", async () => {
    const res = await GET(
      new Request("http://internal/api/v1", { headers: { "x-forwarded-host": "tasks.example.app", "x-forwarded-proto": "https" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("https://tasks.example.app/api/v1/spaces");
    expect(text).toContain("X-Space-Key");
    for (const path of ["/tasks", "/search", "/board.md", "/milestones", "/documents", "/decisions", "/activity", "/statistics"]) {
      expect(text).toContain(path);
    }
  });

  it("contains no secrets", async () => {
    const text = await (await GET(new Request("http://localhost:3100/api/v1"))).text();
    expect(text).not.toMatch(/sk_[a-z0-9]{10,}/);
    expect(text).not.toContain("dev-token");
    expect(text).toContain("$TASKHUB_TOKEN");
  });
});
