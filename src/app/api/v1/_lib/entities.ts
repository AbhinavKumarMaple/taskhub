/**
 * Milestones, documents and decisions share one REST shape:
 * GET|POST /{kind} · GET|PATCH|DELETE /{kind}/{ref} · POST /{kind}/{ref}/archive|restore
 */
import * as svc from "@/server/service";
import { NotFound } from "@/server/errors";
import { api, boolParam, listParam, oneParam, readBody } from "./http";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => Promise<unknown>;

type EntityOps = {
  list: Fn;
  create: Fn;
  get: Fn;
  update: Fn;
  archive: Fn;
  restore: Fn;
  remove: Fn;
};

const OPS: Record<"milestones" | "documents" | "decisions", EntityOps> = {
  milestones: {
    list: svc.listMilestones,
    create: svc.createMilestone,
    get: svc.getMilestone,
    update: svc.updateMilestone,
    archive: svc.archiveMilestone,
    restore: svc.restoreMilestone,
    remove: svc.deleteMilestone,
  },
  documents: {
    list: svc.listDocuments,
    create: svc.createDocument,
    get: svc.getDocument,
    update: svc.updateDocument,
    archive: svc.archiveDocument,
    restore: svc.restoreDocument,
    remove: svc.deleteDocument,
  },
  decisions: {
    list: svc.listDecisions,
    create: svc.createDecision,
    get: svc.getDecision,
    update: svc.updateDecision,
    archive: svc.archiveDecision,
    restore: svc.restoreDecision,
    remove: svc.deleteDecision,
  },
};

type Kind = keyof typeof OPS;

/** `/api/v1/{kind}` — list (filters: space, include_archived, archived_only, q, status) and create. */
export function collectionRoutes(kind: Kind) {
  const ops = OPS[kind];
  return {
    GET: api(async ({ access, query }) =>
      ops.list(access, {
        spaces: listParam(query.spaces),
        includeArchived: boolParam(query.includeArchived),
        archivedOnly: boolParam(query.archivedOnly),
        q: oneParam(query.q),
        status: oneParam(query.status),
      }),
    ),
    POST: api(async ({ req, access }) => ops.create(access, await readBody(req)), { status: 201 }),
  };
}

/** `/api/v1/{kind}/{ref}` — view, edit, delete (archived only). */
export function itemRoutes(kind: Kind) {
  const ops = OPS[kind];
  return {
    GET: api<{ ref: string }>(async ({ access, params }) => ops.get(access, params.ref)),
    PATCH: api<{ ref: string }>(async ({ req, access, params }) => ops.update(access, params.ref, await readBody(req))),
    DELETE: api<{ ref: string }>(async ({ access, params }) => ops.remove(access, params.ref)),
  };
}

/** `/api/v1/{kind}/{ref}/archive|restore`. */
export function actionRoutes(kind: Kind) {
  const ops = OPS[kind];
  return {
    POST: api<{ ref: string; action: string }>(async ({ access, params }) => {
      if (params.action === "archive") return ops.archive(access, params.ref);
      if (params.action === "restore") return ops.restore(access, params.ref);
      throw new NotFound(`Unknown action "${params.action}"`);
    }),
  };
}
