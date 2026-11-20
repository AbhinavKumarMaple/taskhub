"use client";

import { CircleDashed, ExternalLink, RefreshCw, Rocket, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { DeploymentEvent, DeploymentState } from "@/lib/types";
import { Section } from "./section";

type Req = { kind: "deploy" | "rollback"; environment: string };

const safeLink = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

/**
 * Where a task that ships code is live. One row per environment (deployed: version, when, who, link), buttons to
 * record a deploy or a roll-back, and the full deploy history. Plain tasks only show the "Ships code" switch.
 */
export function Deployments({
  taskRef,
  deployable,
  current,
  history,
  environments,
  onDeployable,
  onChanged,
}: {
  taskRef: string;
  deployable: boolean;
  current: Record<string, DeploymentState>;
  history: DeploymentEvent[];
  environments: string[];
  onDeployable: (v: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [req, setReq] = useState<Req | null>(null);
  const [showAll, setShowAll] = useState(false);
  const live = Object.keys(current);
  const envs = [...environments, ...live.filter((e) => !environments.includes(e))];
  const tracked = deployable || live.length > 0 || history.length > 0;

  const submit = async (r: Req, body: Record<string, string>) => {
    const res = await fetch(`/api/v1/tasks/${taskRef}/${r.kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ environment: r.environment, ...body }),
    }).catch(() => null);
    if (!res?.ok) {
      const b = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      return b?.error?.message ?? "The server did not respond.";
    }
    toast.success(r.kind === "deploy" ? `${taskRef} marked deployed to ${r.environment}` : `${taskRef} rolled back from ${r.environment}`);
    setReq(null);
    await onChanged();
    return null;
  };

  const steps = [...history].reverse();
  const shown = showAll ? steps : steps.slice(0, 5);

  return (
    <Section
      title="Deployment"
      meta={tracked ? (live.length ? `${live.length} of ${envs.length} live` : "not deployed") : undefined}
      actions={
        <Checkbox
          className="whitespace-nowrap"
          label={<span className="text-xs text-fg-muted">Ships code</span>}
          checked={deployable}
          onChange={(e) => onDeployable(e.target.checked)}
        />
      }
    >
      {!tracked ? (
        <p className="text-xs text-fg-subtle">Nothing to deploy. Tick “Ships code” if this work goes live somewhere.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {envs.map((e) => {
              const d = current[e];
              const link = d ? safeLink(d.url) : null;
              return (
                <li key={e} className="flex min-w-0 items-center gap-2 px-3 py-2">
                  {d ? (
                    <Rocket className="size-3.5 shrink-0 text-done-fg" aria-hidden />
                  ) : (
                    <CircleDashed className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-fg">{e}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {d ? (
                        <>
                          {d.version && <span className="font-mono text-fg-muted">{d.version} · </span>}
                          <time dateTime={d.at} title={formatDateTime(d.at)} suppressHydrationWarning>
                            {relativeTime(d.at)}
                          </time>{" "}
                          by {d.actor}
                          {d.note && <> · {d.note}</>}
                        </>
                      ) : (
                        "Not deployed"
                      )}
                    </p>
                  </div>
                  {d ? (
                    <span className="flex shrink-0 items-center">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex size-6 items-center justify-center rounded-[5px] text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={`Open the ${e} deploy`}
                          title={link}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      <IconButton size="xs" label={`Record a new ${e} deploy`} title={`Record a new ${e} deploy`} onClick={() => setReq({ kind: "deploy", environment: e })}>
                        <RefreshCw className="size-3.5" />
                      </IconButton>
                      <IconButton size="xs" label={`Roll back from ${e}`} title={`Roll back from ${e}`} onClick={() => setReq({ kind: "rollback", environment: e })}>
                        <Undo2 className="size-3.5" />
                      </IconButton>
                    </span>
                  ) : (
                    <Button size="xs" variant="secondary" icon={<Rocket className="size-3.5" />} onClick={() => setReq({ kind: "deploy", environment: e })}>
                      Mark deployed
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {steps.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1.5">
              {shown.map((s) => (
                <li key={s.id} className="flex min-w-0 gap-2 text-xs text-fg-muted">
                  <time className="shrink-0 tabular-nums text-fg-subtle" dateTime={new Date(s.createdAt).toISOString()} title={formatDateTime(s.createdAt)} suppressHydrationWarning>
                    {relativeTime(s.createdAt)}
                  </time>
                  <span className="min-w-0">
                    <span className={cn("font-medium", s.action === "deployed" ? "text-fg" : "text-danger")}>
                      {s.action === "deployed" ? `Deployed to ${s.environment}` : `Rolled back from ${s.environment}`}
                    </span>
                    {s.version && <span className="font-mono"> {s.version}</span>} by {s.actor}
                    {s.note && <>: {s.note}</>}
                  </span>
                </li>
              ))}
              {steps.length > 5 && (
                <li>
                  <Button size="xs" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show fewer" : `Show all ${steps.length}`}
                  </Button>
                </li>
              )}
            </ol>
          )}
        </>
      )}
      <DeployDialog request={req} onCancel={() => setReq(null)} onSubmit={submit} />
    </Section>
  );
}

function DeployDialog({
  request,
  onCancel,
  onSubmit,
}: {
  request: Req | null;
  onCancel: () => void;
  onSubmit: (r: Req, body: Record<string, string>) => Promise<string | null>;
}) {
  const id = useId();
  const [version, setVersion] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState<Req | null>(null);
  if (request !== shown) {
    setShown(request);
    setVersion("");
    setUrl("");
    setNote("");
    setError(null);
  }
  const deploy = request?.kind === "deploy";
  const urlBad = url.trim() !== "" && !/^https?:\/\/\S+$/i.test(url.trim());

  const submit = async () => {
    if (!request || pending || urlBad) return;
    setPending(true);
    const body: Record<string, string> = deploy
      ? { version: version.trim(), url: url.trim(), note: note.trim() }
      : { note: note.trim() };
    const err = await onSubmit(request, body);
    setPending(false);
    setError(err);
  };

  return (
    <Dialog
      open={!!request}
      onClose={onCancel}
      size="sm"
      title={request ? (deploy ? `Deployed to ${request.environment}` : `Roll back from ${request.environment}?`) : ""}
      description={
        deploy
          ? "Record a deploy you have seen succeed. Everything here is optional."
          : "It stops showing as live there. The deploy stays in the history."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant={deploy ? "primary" : "danger"} onClick={() => void submit()} loading={pending} disabled={urlBad}>
            {deploy ? "Mark deployed" : "Roll back"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {deploy && (
          <>
            <Field label="Version" htmlFor={`${id}-v`} hint="Commit, tag or build id">
              <Input id={`${id}-v`} autoFocus value={version} maxLength={200} placeholder="8e3d7d1" onChange={(e) => setVersion(e.target.value)} />
            </Field>
            <Field label="Link" htmlFor={`${id}-u`} error={urlBad ? "Use an http(s) link" : undefined}>
              <Input id={`${id}-u`} value={url} maxLength={2000} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </>
        )}
        <Field label={deploy ? "Note" : "Why"} htmlFor={`${id}-n`}>
          <Input
            id={`${id}-n`}
            autoFocus={!deploy}
            value={note}
            maxLength={2000}
            placeholder={deploy ? "Optional" : "Reverted: broke checkout"}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
