"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Comment } from "@/lib/types";
import { Section } from "./section";
import { useUnsaved } from "./unsaved";

/** Comment list (oldest first) and a markdown box to add one. */
export function Comments({
  comments,
  onAdd,
}: {
  comments: Comment[];
  /** Resolves to an error message, or null. */
  onAdd: (body: string) => Promise<string | null>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useUnsaved(!!body.trim());
  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    const err = await onAdd(body);
    setBusy(false);
    setError(err);
    if (!err) setBody("");
  };
  return (
    <Section title="Comments" meta={comments.length || undefined}>
      {comments.length > 0 && (
        <ol className="mb-3 flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-border px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-medium text-fg">{c.author}</span>
                <time dateTime={new Date(c.createdAt).toISOString()} title={formatDateTime(c.createdAt)} className="text-fg-subtle" suppressHydrationWarning>
                  {relativeTime(c.createdAt)}
                </time>
              </div>
              <Markdown>{c.body}</Markdown>
            </li>
          ))}
        </ol>
      )}
      <MarkdownEditor value={body} onChange={setBody} rows={3} placeholder="Write a comment (markdown)" onSubmit={submit} aria-label="New comment" />
      <div className="mt-2 flex items-center justify-end gap-2">
        {error && (
          <p className="mr-auto text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <span className="text-xs text-fg-subtle">⌘Enter</span>
        <Button size="sm" variant="primary" loading={busy} disabled={!body.trim()} onClick={submit}>
          Comment
        </Button>
      </div>
    </Section>
  );
}
