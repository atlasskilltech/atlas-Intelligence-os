"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, Spinner } from "@/components/ui/States";
import { fmtDateTime, fmtInt } from "@/components/ui/format";

const WARN_AT = 90; // % used

async function fetchBalance() {
  try {
    const res = await fetch("/api/voice/elevenlabs", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Could not load the balance.");
    if (!data.configured) return { status: "off" };
    if (data.error) return { status: "error", message: data.error.message, type: data.error.type };
    return { status: "ok", credits: data.credits };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

/** ElevenLabs credit balance: used / limit, reset date, and a warning near the limit. */
export default function ElevenLabsCredits({ configured, active }) {
  const [state, setState] = useState({ status: configured ? "loading" : "off" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchBalance().then(setState);
  }, []);

  useEffect(() => {
    let live = true;
    if (configured) fetchBalance().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [configured]);

  const c = state.credits;
  const pct = c ? c.percentUsed : 0;
  const tone = pct >= 100 ? "bg-red-500" : pct >= WARN_AT ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card>
      <CardHeader title="ElevenLabs credits" description="1 character spoken ≈ 1 credit." />
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">ElevenLabs API key</span>
          {configured ? <Badge tone="success">Set on server</Badge> : <Badge tone="neutral">Not added</Badge>}
        </div>

        {!configured && (
          <p className="text-xs text-slate-500">
            Add <code className="font-mono">ELEVENLABS_API_KEY=…</code> (and optionally <code className="font-mono">ELEVENLABS_VOICE_ID</code>) to{" "}
            <code className="font-mono">.env.local</code> and restart the app.
          </p>
        )}

        {state.status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" /> Checking balance…
          </div>
        )}

        {state.status === "ok" && c && (
          <>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-800">
                  {fmtInt(c.used)} / {fmtInt(c.limit)}
                </span>
                <span className="tabular-nums text-slate-500">{pct}% used</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <dt>Remaining</dt>
              <dd className="text-right tabular-nums">{fmtInt(c.remaining)}</dd>
              <dt>Plan</dt>
              <dd className="text-right capitalize">{c.tier}</dd>
              <dt>Resets</dt>
              <dd className="text-right">{c.resetsAt ? fmtDateTime(c.resetsAt) : "—"}</dd>
            </dl>
            {pct >= 100 ? (
              <Alert tone="error" title="Credits used up">
                {active ? "Replies are being spoken with OpenAI until the credits reset. " : ""}Switch Voice to OpenAI, upgrade the plan, or wait for the reset.
              </Alert>
            ) : pct >= WARN_AT ? (
              <Alert tone="warning" title="Credits almost used up">
                When they run out, replies switch to OpenAI automatically. You can also switch Voice to OpenAI now.
              </Alert>
            ) : null}
          </>
        )}

        {state.status === "error" && (
          <Alert tone={state.type === "quota" ? "error" : "warning"} title="ElevenLabs">
            {state.message} {active ? "Replies are spoken with OpenAI meanwhile." : ""}
          </Alert>
        )}

        {configured && (
          <Button variant="secondary" size="sm" className="w-full" onClick={load} disabled={state.status === "loading"}>
            Refresh balance
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
