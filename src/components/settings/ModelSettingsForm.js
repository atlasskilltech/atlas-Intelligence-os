"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert, Spinner } from "@/components/ui/States";
import ElevenLabsCredits from "./ElevenLabsCredits";

async function api(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed."), { fields: data?.error?.fields });
  return data;
}

export default function ModelSettingsForm({ initialSettings, status, limits, defaultPricing }) {
  const [form, setForm] = useState(initialSettings);
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState({ state: "idle" });
  const [test, setTest] = useState({ state: "idle" });
  const [models, setModels] = useState({ state: "idle", list: [] });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSave(e) {
    e.preventDefault();
    setSave({ state: "saving" });
    setErrors({});
    try {
      const { pricingOverrides, ...rest } = form;
      const data = await api("/api/settings/models", {
        method: "PUT",
        body: JSON.stringify({ ...rest, pricingOverrides }),
      });
      setForm(data.settings);
      setSave({ state: "saved" });
    } catch (err) {
      setErrors(err.fields || {});
      setSave({ state: "error", message: err.message });
    }
  }

  async function onTest() {
    setTest({ state: "running" });
    try {
      const data = await api("/api/ai/test", { method: "POST", body: JSON.stringify({ model: form.defaultModel }) });
      setTest({ state: "ok", data });
    } catch (err) {
      setTest({ state: "error", message: err.message });
    }
  }

  async function loadModels() {
    setModels({ state: "loading", list: [] });
    try {
      const data = await api("/api/ai/models");
      setModels({ state: "ok", list: data.models });
    } catch (err) {
      setModels({ state: "error", list: [], message: err.message });
    }
  }

  const pricingRows = Object.entries({ ...defaultPricing, ...form.pricingOverrides });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <form onSubmit={onSave} noValidate>
          <Card>
            <CardHeader title="Models" description="Which model is used for each kind of work." />
            <CardBody className="space-y-5">
              <Field label="AI provider" htmlFor="provider" hint="Anthropic Claude, Google Gemini, OpenRouter and local models can be added later.">
                <Select id="provider" value="openai" disabled>
                  <option value="openai">OpenAI</option>
                </Select>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Planning model"
                  htmlFor="plannerModel"
                  hint="Turns prompts into agents. Use a stronger model."
                  error={errors.plannerModel}
                >
                  <Input id="plannerModel" list="model-options" value={form.plannerModel} onChange={set("plannerModel")} invalid={!!errors.plannerModel} />
                </Field>
                <Field
                  label="Agent run model"
                  htmlFor="defaultModel"
                  hint="Runs agent steps. A smaller model keeps costs down."
                  error={errors.defaultModel}
                >
                  <Input id="defaultModel" list="model-options" value={form.defaultModel} onChange={set("defaultModel")} invalid={!!errors.defaultModel} />
                </Field>
              </div>
              <datalist id="model-options">
                {models.list.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" size="sm" onClick={loadModels} disabled={!status.configured || models.state === "loading"}>
                  {models.state === "loading" && <Spinner className="size-3.5" />}
                  Load models available to your key
                </Button>
                {models.state === "ok" && <span className="text-xs text-slate-500">{models.list.length} models loaded — start typing in a model field.</span>}
                {models.state === "error" && <span className="text-xs text-red-600">{models.message}</span>}
              </div>
            </CardBody>

            <CardHeader
              title="Voice assistant"
              description="Who speaks the replies on the Voice page. Listening (speech-to-text) always uses OpenAI."
              className="border-t"
            />
            <CardBody className="space-y-3">
              <Field
                label="Voice (text-to-speech)"
                htmlFor="voiceProvider"
                error={errors.voiceProvider}
                hint="If ElevenLabs fails or its credits run out, that reply is spoken with OpenAI automatically."
              >
                <Select id="voiceProvider" value={form.voiceProvider || "openai"} onChange={set("voiceProvider")} invalid={!!errors.voiceProvider}>
                  <option value="openai">OpenAI — low cost, pay per use</option>
                  <option value="elevenlabs">ElevenLabs — more natural voice, uses credits</option>
                </Select>
              </Field>
              {form.voiceProvider === "elevenlabs" && !status.elevenlabsConfigured && (
                <Alert tone="warning" title="ElevenLabs key missing">
                  Add <code className="font-mono">ELEVENLABS_API_KEY</code> on the server. Until then replies are spoken with OpenAI.
                </Alert>
              )}
            </CardBody>

            <CardHeader title="Safety limits" description="Applied to every AI request." className="border-t" />
            <CardBody className="grid gap-5 sm:grid-cols-3">
              <Field label="Max output tokens" htmlFor="maxOutputTokens" error={errors.maxOutputTokens} hint={`${limits.maxOutputTokens.min}–${limits.maxOutputTokens.max}`}>
                <Input id="maxOutputTokens" type="number" value={form.maxOutputTokens} onChange={set("maxOutputTokens")} invalid={!!errors.maxOutputTokens} />
              </Field>
              <Field label="Request timeout (sec)" htmlFor="requestTimeoutSec" error={errors.requestTimeoutSec} hint={`${limits.requestTimeoutSec.min}–${limits.requestTimeoutSec.max}`}>
                <Input id="requestTimeoutSec" type="number" value={form.requestTimeoutSec} onChange={set("requestTimeoutSec")} invalid={!!errors.requestTimeoutSec} />
              </Field>
              <Field label="Retries on temporary errors" htmlFor="maxRetries" error={errors.maxRetries} hint={`${limits.maxRetries.min}–${limits.maxRetries.max}`}>
                <Input id="maxRetries" type="number" value={form.maxRetries} onChange={set("maxRetries")} invalid={!!errors.maxRetries} />
              </Field>
            </CardBody>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
              {save.state === "saved" && <span className="text-sm text-emerald-700">Settings saved.</span>}
              {save.state === "error" && <span className="text-sm text-red-600">{save.message}</span>}
              <Button type="submit" disabled={save.state === "saving"}>
                {save.state === "saving" && <Spinner className="size-4 border-white/40 border-t-white" />}
                Save settings
              </Button>
            </div>
          </Card>
        </form>

        <Card>
          <CardHeader
            title="Pricing used for cost estimates"
            description="USD per 1 million tokens. Prices change — verify on openai.com/api/pricing. Models not listed show “price not set”."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Model</th>
                  <th className="px-5 py-2.5 text-right font-medium">Input</th>
                  <th className="px-5 py-2.5 text-right font-medium">Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pricingRows.map(([model, p]) => (
                  <tr key={model}>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-700">
                      {model} {form.pricingOverrides?.[model] && <Badge tone="brand" className="ml-1">custom</Badge>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">${p.input}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">${p.output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PriceEditor
            onAdd={(model, price) =>
              setForm((f) => ({ ...f, pricingOverrides: { ...f.pricingOverrides, [model]: price } }))
            }
          />
        </Card>
      </div>

      <div className="space-y-6">
        <ElevenLabsCredits configured={status.elevenlabsConfigured} active={form.voiceProvider === "elevenlabs"} />
        <Card>
          <CardHeader title="Connection" />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">OpenAI API key</span>
              {status.configured ? <Badge tone="success">Set on server</Badge> : <Badge tone="warning">Missing</Badge>}
            </div>
            {!status.configured && (
              <Alert tone="warning" title="Add your API key">
                On the server, add <code className="font-mono">OPENAI_API_KEY=…</code> to <code className="font-mono">.env.local</code> and restart the app.
              </Alert>
            )}
            {status.customBaseURL && <p className="text-xs text-slate-500">Using a custom OpenAI-compatible endpoint (OPENAI_BASE_URL).</p>}
            <Button variant="secondary" className="w-full" onClick={onTest} disabled={!status.configured || test.state === "running"}>
              {test.state === "running" && <Spinner className="size-4" />}
              Test connection
            </Button>
            <p className="text-xs text-slate-500">Sends one short message using the agent run model ({form.defaultModel}). Save changes first.</p>
            {test.state === "ok" && (
              <Alert tone="success" title="Connection works">
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  <dt>Model</dt><dd className="font-mono">{test.data.model}</dd>
                  <dt>Reply</dt><dd className="truncate">{test.data.text || "—"}</dd>
                  <dt>Tokens</dt><dd>{test.data.usage.inputTokens} in / {test.data.usage.outputTokens} out</dd>
                  <dt>Est. cost</dt><dd>{test.data.costUsd == null ? "price not set" : `$${test.data.costUsd.toFixed(6)}`}</dd>
                  <dt>Time</dt><dd>{(test.data.latencyMs / 1000).toFixed(1)}s</dd>
                </dl>
              </Alert>
            )}
            {test.state === "error" && <Alert tone="error" title="Test failed">{test.message}</Alert>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PriceEditor({ onAdd }) {
  const [row, setRow] = useState({ model: "", input: "", output: "" });
  const valid = row.model.trim() && row.input !== "" && row.output !== "" && Number(row.input) >= 0 && Number(row.output) >= 0;
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-5 py-4">
      <Field label="Model" htmlFor="pm" className="min-w-40 flex-1">
        <Input id="pm" placeholder="e.g. gpt-5.4-mini" value={row.model} onChange={(e) => setRow({ ...row, model: e.target.value })} />
      </Field>
      <Field label="Input $" htmlFor="pi" className="w-24">
        <Input id="pi" type="number" min="0" step="0.01" value={row.input} onChange={(e) => setRow({ ...row, input: e.target.value })} />
      </Field>
      <Field label="Output $" htmlFor="po" className="w-24">
        <Input id="po" type="number" min="0" step="0.01" value={row.output} onChange={(e) => setRow({ ...row, output: e.target.value })} />
      </Field>
      <Button
        variant="secondary"
        disabled={!valid}
        onClick={() => {
          onAdd(row.model.trim(), { input: Number(row.input), output: Number(row.output) });
          setRow({ model: "", input: "", output: "" });
        }}
      >
        Add price
      </Button>
      <p className="w-full text-xs text-slate-500">Added prices are saved when you click “Save settings”.</p>
    </div>
  );
}
