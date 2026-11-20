import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { attachments, tasks } from "../db/schema";
import { Invalid, NotFound } from "../errors";
import { parse } from "../validation";
import type { Access, Attachment } from "@/lib/types";
import { logActivity, withTx } from "./context";
import { attachmentMetaCols, loadTask, toAttachment } from "./tasks";

/** Per file. Vercel caps a request body at 4.5 MB, so base64 JSON of 3 MB still fits. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
/** All attachments together (Neon's free plan has 0.5 GB for everything). */
export const MAX_TOTAL_ATTACHMENT_BYTES = 300 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 20;

/** Image types we accept, recognised from the bytes (never from the uploader's claim). SVG is not allowed. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return "image/gif";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Width/height from the image header when it is cheap to read (PNG, GIF, JPEG SOF, WebP VP8/VP8L/VP8X). */
export function imageSize(b: Uint8Array, type: string): { width: number; height: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  try {
    if (type === "image/png" && b.length >= 24) return { width: u32be(16), height: u32be(20) };
    if (type === "image/gif" && b.length >= 10) return { width: u16le(6), height: u16le(8) };
    if (type === "image/webp" && b.length >= 30) {
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (kind === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
      if (kind === "VP8L") {
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8X") return { width: u24le(24) + 1, height: u24le(27) + 1 };
    }
    if (type === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = u16be(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
          return { width: u16be(i + 7), height: u16be(i + 5) };
        i += 2 + len;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

const addInput = z.object({
  filename: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(2000).optional(),
});

function cleanName(name: string | undefined, type: string, id: string): string {
  const base = (name ?? "")
    .replace(/[\\/]/g, "_")
    .replace(/[^\w .()-]/g, "")
    .trim()
    .slice(0, 120);
  const ext = EXT[type];
  if (!base) return `screenshot-${id}.${ext}`;
  return /\.(png|jpe?g|gif|webp)$/i.test(base) ? base.replace(/\.(png|jpe?g|gif|webp)$/i, `.${ext}`) : `${base}.${ext}`;
}

/** Attach an image to a task. The bytes are checked: PNG, JPEG, GIF or WebP, at most 3 MB. */
export async function addAttachment(
  access: Access,
  ref: string,
  input: { data: Uint8Array; filename?: string; caption?: string },
): Promise<Attachment> {
  const p = parse(addInput, { filename: input.filename, caption: input.caption });
  const data = input.data;
  if (!data?.length) throw new Invalid("The file is empty");
  if (data.length > MAX_ATTACHMENT_BYTES)
    throw new Invalid(`The image is ${(data.length / 1048576).toFixed(1)} MB; the limit is 3 MB. Crop it or save it as JPEG/WebP.`);
  const type = sniffImage(data);
  if (!type) throw new Invalid("Only PNG, JPEG, GIF or WebP images can be attached");
  const size = imageSize(data, type);

  return withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    const [{ n, total }] = await tx
      .select({
        n: sql<number>`(count(*) filter (where ${attachments.taskId} = ${cur.id}))::int`,
        total: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint`,
      })
      .from(attachments);
    if (n >= MAX_ATTACHMENTS_PER_TASK) throw new Invalid(`${cur.ref} already has ${n} attachments (the limit)`);
    if (Number(total) + data.length > MAX_TOTAL_ATTACHMENT_BYTES)
      throw new Invalid("Attachment storage is full (300 MB). Delete old screenshots first.");
    const [row] = await tx
      .insert(attachments)
      .values({
        taskId: cur.id,
        filename: cleanName(p.filename, type, cur.ref),
        contentType: type,
        size: data.length,
        width: size?.width ?? null,
        height: size?.height ?? null,
        caption: p.caption ?? "",
        actor: access.actor || "chat",
        data: Buffer.from(data),
      })
      .returning(attachmentMetaCols);
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, cur.id));
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "attached",
      summary: `Attached ${row.filename} to ${cur.ref}${p.caption ? `: ${p.caption.length > 80 ? p.caption.slice(0, 77) + "…" : p.caption}` : ""}`,
      changes: { attachments: { from: null, to: row.filename } },
    });
    return toAttachment(cur.ref, row);
  });
}

export async function listAttachments(access: Access, ref: string): Promise<Attachment[]> {
  const q = await getDb();
  const cur = await loadTask(q, access, ref);
  const rows = await q.select(attachmentMetaCols).from(attachments).where(eq(attachments.taskId, cur.id)).orderBy(asc(attachments.id));
  return rows.map((r) => toAttachment(cur.ref, r));
}

/** The image bytes, only when the task is in the caller's Spaces. */
export async function getAttachmentFile(
  access: Access,
  ref: string,
  id: number,
): Promise<{ data: Buffer; contentType: string; filename: string; size: number }> {
  const q = await getDb();
  const cur = await loadTask(q, access, ref);
  const [row] = await q
    .select({ data: attachments.data, contentType: attachments.contentType, filename: attachments.filename, size: attachments.size })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.taskId, cur.id)));
  if (!row) throw new NotFound(`Attachment ${id} not found on ${cur.ref}`);
  return row;
}

export async function updateAttachment(access: Access, ref: string, id: number, input: { caption?: string }): Promise<Attachment> {
  const p = parse(z.object({ caption: z.string().trim().max(2000) }), input);
  return withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    const [row] = await tx
      .update(attachments)
      .set({ caption: p.caption })
      .where(and(eq(attachments.id, id), eq(attachments.taskId, cur.id)))
      .returning(attachmentMetaCols);
    if (!row) throw new NotFound(`Attachment ${id} not found on ${cur.ref}`);
    return toAttachment(cur.ref, row);
  });
}

export async function deleteAttachment(access: Access, ref: string, id: number): Promise<{ id: number; deleted: true }> {
  return withTx(async (tx) => {
    const cur = await loadTask(tx, access, ref);
    const [row] = await tx
      .delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.taskId, cur.id)))
      .returning({ filename: attachments.filename });
    if (!row) throw new NotFound(`Attachment ${id} not found on ${cur.ref}`);
    await logActivity(tx, access, {
      spaceId: cur.spaceId,
      entityType: "task",
      entityRef: cur.ref,
      action: "attached",
      summary: `Removed ${row.filename} from ${cur.ref}`,
      changes: { attachments: { from: row.filename, to: null } },
    });
    return { id, deleted: true as const };
  });
}
