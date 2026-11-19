/**
 * Demo data (neutral content): 2 Spaces, features with sub-features, fixes, an archived minor item,
 * a milestone, a document and a decision.
 *   npm run db:seed         (refuses if Spaces already exist; pass --force to add anyway)
 */
import { closeDb, getDb } from "../src/server/db";
import { spaces } from "../src/server/db/schema";
import * as svc from "../src/server/service";
import type { Access } from "../src/lib/types";

const owner: Access = { actor: "owner", spaces: "all" };
const chat: Access = { actor: "demo-chat", spaces: "all" };

async function main() {
  const db = await getDb();
  const existing = await db.select({ id: spaces.id }).from(spaces);
  if (existing.length && !process.argv.includes("--force")) {
    console.log(`Database already has ${existing.length} Space(s); not seeding. Use --force to add demo data anyway.`);
    return;
  }

  const site = await svc.createSpace(owner, {
    name: "Recipe site",
    color: "blue",
    description: "A small website for sharing family recipes.",
  });
  const lab = await svc.createSpace(owner, {
    name: "Home lab",
    color: "green",
    description: "Self-hosted services at home.",
  });

  const m1 = await svc.createMilestone(owner, {
    spaceId: site.id,
    title: "Public launch",
    description: "Everything needed before sharing the link with friends.",
    dueDate: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
  });

  // Feature with sub-features
  const search = await svc.createTask(owner, {
    spaceId: site.id,
    title: "Recipe search",
    description: "Find recipes by name, ingredient or tag.",
    priority: "High",
    milestone: m1.ref,
    acceptanceCriteria: ["Search box on every page", "Ingredient filter", "Results page"],
  });
  const box = await svc.createTask(chat, { parent: search.ref, title: "Search box on every page", status: "Done" });
  await svc.updateTask(chat, box.ref, { finalSummary: "Added to the header; submits to /search.", modifiedFiles: ["src/header.tsx"] });
  await svc.updateTask(chat, search.ref, { checkAc: [1], status: "In Progress", plan: "1. Box\n2. Filter\n3. Results page" });
  await svc.createTask(chat, {
    parent: search.ref,
    title: "Ingredient filter",
    status: "In Progress",
    notes: "Using a simple tag index for now.",
  });
  const results = await svc.createTask(chat, { parent: search.ref, title: "Results page" });
  await svc.updateTask(chat, results.ref, { addLabels: ["waiting"], appendNotes: "Waiting for the owner to pick a card layout." });
  await svc.updateTask(chat, search.ref, { addLabels: ["waiting"] });

  const photos = await svc.createTask(owner, {
    spaceId: site.id,
    title: "Photo uploads",
    description: "Let each recipe have up to five photos.",
    priority: "Medium",
    milestone: m1.ref,
    acceptanceCriteria: ["Upload form", "Thumbnails"],
    dependsOn: [search.ref],
  });
  await svc.createTask(owner, { parent: photos.ref, title: "Upload form" });
  await svc.createTask(owner, { parent: photos.ref, title: "Thumbnails" });
  await svc.createTask(owner, {
    parent: photos.ref,
    title: "Large photos time out on upload",
    type: "fix",
    priority: "High",
  });

  await svc.createTask(owner, {
    spaceId: site.id,
    title: "Print-friendly recipe view",
    priority: "Low",
    description: "A clean layout without navigation when printing.",
  });
  await svc.createTask(owner, { spaceId: site.id, title: "Footer links point to old domain", type: "fix", priority: "Medium" });

  // Minor: created Done, then archived
  const minor = await svc.createTask(chat, {
    spaceId: site.id,
    title: "Fix typo on the about page",
    type: "minor",
    status: "Done",
    finalSummary: "Corrected 'recipies'.",
  });
  await svc.archiveTask(chat, minor.ref);

  await svc.createTask(owner, { spaceId: site.id, title: "Idea: weekly meal planner", isDraft: true });

  await svc.createDocument(owner, {
    spaceId: site.id,
    title: "Content guidelines",
    body: "# Content guidelines\n\n- Every recipe lists servings and total time.\n- Use metric units first, imperial in brackets.\n- Photos must be your own.\n\n| Field | Required |\n|---|---|\n| Title | yes |\n| Servings | yes |\n| Tags | no |\n",
  });
  await svc.createDecision(owner, {
    spaceId: site.id,
    title: "Store photos in object storage",
    status: "accepted",
    context: "Photos are large and the database should stay small.",
    decision: "Upload photos to an object store and keep only their keys in the database.",
    consequences: "Needs signed upload URLs; backups cover two places.",
  });

  // Second Space
  const backup = await svc.createTask(owner, {
    spaceId: lab.id,
    title: "Nightly backups",
    priority: "High",
    acceptanceCriteria: ["Backup job", "Restore test"],
  });
  await svc.createTask(owner, { parent: backup.ref, title: "Backup job", status: "Done" });
  await svc.createTask(owner, { parent: backup.ref, title: "Restore test" });
  await svc.updateTask(owner, backup.ref, { checkAc: [1], status: "In Progress" });
  await svc.createTask(owner, { spaceId: lab.id, title: "Media server", priority: "Medium" });
  await svc.createTask(owner, { spaceId: lab.id, title: "Router drops connection at night", type: "fix" });
  await svc.addComment(owner, backup.ref, { body: "Run the restore test on the spare disk." });

  console.log("Seeded demo data:");
  for (const s of [site, lab]) console.log(`  ${s.name}  id=${s.id}  key=${s.key}`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
