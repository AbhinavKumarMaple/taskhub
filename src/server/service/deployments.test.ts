import { describe, expect, it } from "vitest";
import * as svc from "@/server/service";
import { makeSpace, OWNER, setupTestDb } from "./test-helpers";

setupTestDb();

describe("deployments", () => {
  it("defaults to Development and Production; plain tasks are not deployable", async () => {
    expect((await svc.getSettings(OWNER)).environments).toEqual(["Development", "Production"]);
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "Write the README" });
    expect(t.deployable).toBe(false);
    expect(t.deployments).toEqual({});
    expect(t.deployHistory).toEqual([]);
  });

  it("records a deploy per environment with version, link, who and when; history keeps every step", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "Export PDF", deployable: true });
    expect(t.deployable).toBe(true);

    const [dev] = await svc.recordDeployment(chat, {
      refs: [t.ref],
      environment: "development", // case-insensitive, stored as configured
      version: "abc1234",
      url: "https://preview.example.com",
    });
    expect(Object.keys(dev.deployments)).toEqual(["Development"]);
    expect(dev.deployments.Development).toMatchObject({ version: "abc1234", url: "https://preview.example.com", actor: "chat" });

    await svc.recordDeployment(chat, { refs: [t.ref], environment: "Production", version: "abc1234" });
    await svc.recordDeployment(chat, { refs: [t.ref], environment: "Production", version: "def5678", note: "hotfix" });
    let full = await svc.getTask(chat, t.ref);
    expect(full.deployments.Production.version).toBe("def5678");
    expect(full.deployHistory.map((e) => [e.environment, e.action, e.version])).toEqual([
      ["Development", "deployed", "abc1234"],
      ["Production", "deployed", "abc1234"],
      ["Production", "deployed", "def5678"],
    ]);
    expect(full.activity[0]).toMatchObject({ action: "deployed" });
    expect(full.activity[0].summary).toContain("deployed to Production (def5678): hotfix");

    full = await svc.rollbackDeployment(chat, t.ref, { environment: "Production", note: "broke checkout" });
    expect(Object.keys(full.deployments)).toEqual(["Development"]);
    expect(full.deployHistory.at(-1)).toMatchObject({ environment: "Production", action: "rolled_back", version: "def5678", note: "broke checkout" });
    await expect(svc.rollbackDeployment(chat, t.ref, { environment: "Production" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("validates environment and link; one call ships several tasks; include_children covers a feature", async () => {
    const { space, chat } = await makeSpace();
    const f = await svc.createTask(chat, { spaceId: space.id, title: "Feature", type: "feature" });
    const a = await svc.createTask(chat, { parent: f.ref, title: "a" });
    const b = await svc.createTask(chat, { parent: f.ref, title: "b" });
    const gone = await svc.createTask(chat, { parent: f.ref, title: "archived" });
    await svc.archiveTask(chat, gone.ref);
    const other = await svc.createTask(chat, { spaceId: space.id, title: "Other" });

    await expect(svc.recordDeployment(chat, { refs: [a.ref], environment: "Staging" })).rejects.toMatchObject({ code: "invalid" });
    await expect(
      svc.recordDeployment(chat, { refs: [a.ref], environment: "Production", url: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ code: "invalid" });

    const shipped = await svc.recordDeployment(chat, {
      refs: [f.ref, other.ref],
      includeChildren: true,
      environment: "Production",
      version: "v1.2.0",
    });
    expect(shipped.map((s) => s.ref).sort()).toEqual([f.ref, a.ref, b.ref, other.ref].sort());
    expect((await svc.getTask(chat, gone.ref)).deployable).toBe(false);

    const log = await svc.listDeployments(chat, { spaces: [space.id], environment: "production" });
    expect(log).toHaveLength(4);
    expect(log[0]).toMatchObject({ environment: "Production", version: "v1.2.0" });
    expect(log[0].task.ref).toBeTruthy();
  });

  it("filters: deployable, deployed_to, not_deployed_to", async () => {
    const { space, chat } = await makeSpace();
    const plain = await svc.createTask(chat, { spaceId: space.id, title: "plain", status: "Done" });
    const waiting = await svc.createTask(chat, { spaceId: space.id, title: "code, not deployed", deployable: true, status: "Done" });
    const dev = await svc.createTask(chat, { spaceId: space.id, title: "dev only", status: "Done" });
    const prod = await svc.createTask(chat, { spaceId: space.id, title: "everywhere", status: "Done" });
    await svc.recordDeployment(chat, { refs: [dev.ref, prod.ref], environment: "Development" });
    await svc.recordDeployment(chat, { refs: [prod.ref], environment: "Production" });

    const refs = async (f: Parameters<typeof svc.listTasks>[1]) =>
      (await svc.listTasks(chat, { spaces: [space.id], ...f })).items.map((t) => t.ref).sort();
    expect(await refs({ deployable: false })).toEqual([plain.ref]);
    expect(await refs({ deployable: true })).toEqual([waiting.ref, dev.ref, prod.ref].sort());
    expect(await refs({ deployedTo: "Production" })).toEqual([prod.ref]);
    expect(await refs({ deployedTo: ["Development", "Production"] })).toEqual([prod.ref]);
    expect(await refs({ notDeployedTo: "Production" })).toEqual([waiting.ref, dev.ref].sort());
    // names match without case, like deploys do
    expect(await refs({ deployedTo: "production" })).toEqual([prod.ref]);
    expect(await refs({ notDeployedTo: "production" })).toEqual([waiting.ref, dev.ref].sort());

    const md = await svc.exportBoardMarkdown(chat, { spaces: [space.id] });
    expect(md).toContain("Not deployed");
    expect(md).toContain("Deployed: Development, Production");
  });

  it("hides another Space's tasks; environment renames move deploys; removing a used one is refused", async () => {
    const A = await makeSpace();
    const B = await makeSpace();
    const t = await svc.createTask(B.chat, { spaceId: B.space.id, title: "secret" });
    await expect(svc.recordDeployment(A.chat, { refs: [t.ref], environment: "Production" })).rejects.toMatchObject({
      code: "not_found",
    });
    await svc.recordDeployment(B.chat, { refs: [t.ref], environment: "Production", version: "x" });
    expect(await svc.listDeployments(A.chat, {})).toEqual([]);
    await expect(svc.rollbackDeployment(A.chat, t.ref, { environment: "Production" })).rejects.toMatchObject({
      code: "not_found",
    });

    await expect(svc.updateSettings(OWNER, { environments: ["Development"] })).rejects.toMatchObject({ code: "conflict" });
    // renaming onto an existing environment would overwrite its deploys
    await expect(
      svc.updateSettings(OWNER, { environments: ["Production"], renames: { environments: [{ from: "Development", to: "Production" }] } }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      svc.updateSettings(OWNER, { environments: ["Development", "Production", "production"] }),
    ).rejects.toMatchObject({ code: "invalid" });
    const s = await svc.updateSettings(OWNER, {
      environments: ["Development", "Live"],
      renames: { environments: [{ from: "Production", to: "Live" }] },
    });
    expect(s.environments).toEqual(["Development", "Live"]);
    const full = await svc.getTask(B.chat, t.ref);
    expect(full.deployments.Live.version).toBe("x");
    expect(full.deployHistory[0].environment).toBe("Live");
    await svc.updateSettings(OWNER, {
      environments: ["Development", "Production"],
      renames: { environments: [{ from: "Live", to: "Production" }] },
    });
  });

  it("deployable can be set and cleared by update", async () => {
    const { space, chat } = await makeSpace();
    const t = await svc.createTask(chat, { spaceId: space.id, title: "x" });
    expect((await svc.updateTask(chat, t.ref, { deployable: true })).deployable).toBe(true);
    expect((await svc.updateTask(chat, t.ref, { deployable: false })).deployable).toBe(false);
  });
});
