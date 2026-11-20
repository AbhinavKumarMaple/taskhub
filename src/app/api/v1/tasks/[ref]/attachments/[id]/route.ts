import * as svc from "@/server/service";
import { api, intParam, readBody } from "../../../../_lib/http";

type P = { ref: string; id: string };

const idOf = (p: P) => intParam(p.id) ?? 0;

/** GET: the image itself (only for callers holding the task's Space). `?download=1` saves instead of showing. */
export const GET = api<P>(async ({ url, access, params }) => {
  const f = await svc.getAttachmentFile(access, params.ref, idOf(params));
  const disposition = url.searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.contentType,
      "content-length": String(f.size),
      "content-disposition": `${disposition}; filename="${f.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
});

/** PATCH {"caption":"…"} */
export const PATCH = api<P>(async ({ req, access, params }) =>
  svc.updateAttachment(access, params.ref, idOf(params), (await readBody(req)) as { caption?: string }),
);

export const DELETE = api<P>(async ({ access, params }) => svc.deleteAttachment(access, params.ref, idOf(params)));
