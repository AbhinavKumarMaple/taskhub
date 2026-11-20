import * as svc from "@/server/service";
import { Invalid } from "@/server/errors";
import { api, camelize } from "../../../_lib/http";

type P = { ref: string };

/** GET /tasks/{ref}/attachments: metadata of every screenshot on the task. */
export const GET = api<P>(async ({ access, params }) => svc.listAttachments(access, params.ref));

/**
 * POST /tasks/{ref}/attachments. Three ways to send the image:
 *   multipart/form-data: file=@shot.png, caption=…  (curl -F)
 *   application/json: {"data_base64":"…","filename":"…","caption":"…"}
 *   image/png (or jpeg/webp/gif) raw body, with ?caption=…&filename=…
 */
export const POST = api<P>(async ({ req, url, access, params }) => {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  let input: { data: Uint8Array; filename?: string; caption?: string };
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => {
      throw new Invalid("Could not read the form data");
    });
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Invalid('Send the image in a form field named "file"');
    input = {
      data: new Uint8Array(await file.arrayBuffer()),
      filename: String(form.get("filename") ?? file.name ?? ""),
      caption: form.get("caption") === null ? undefined : String(form.get("caption")),
    };
  } else if (type.startsWith("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = camelize(JSON.parse(await req.text()));
    } catch {
      throw new Invalid("Body must be valid JSON");
    }
    const b64 = String(body.dataBase64 ?? body.data ?? "").replace(/^data:[^,]*,/, "");
    if (!b64) throw new Invalid('Send the image as "data_base64"');
    input = {
      data: new Uint8Array(Buffer.from(b64, "base64")),
      filename: body.filename === undefined ? undefined : String(body.filename),
      caption: body.caption === undefined ? undefined : String(body.caption),
    };
  } else {
    input = {
      data: new Uint8Array(await req.arrayBuffer()),
      filename: url.searchParams.get("filename") ?? undefined,
      caption: url.searchParams.get("caption") ?? undefined,
    };
  }
  return Response.json(await svc.addAttachment(access, params.ref, input), {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
});
