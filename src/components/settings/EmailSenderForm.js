"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Alert, Spinner } from "@/components/ui/States";

async function api(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed."), { fields: data?.error?.fields });
  return data;
}

export default function EmailSenderForm({ initialSender, configured, myEmail }) {
  const [sender, setSender] = useState(initialSender);
  const [form, setForm] = useState({ email: initialSender.custom ? initialSender.email : "", name: initialSender.custom ? initialSender.name : "" });
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState({ state: "idle" });
  const [test, setTest] = useState({ state: "idle" });

  const domains = sender.allowedDomains.map((d) => `@${d}`).join(", ");
  const dirty = form.email.trim().toLowerCase() !== (sender.custom ? sender.email : "") || form.name.trim() !== (sender.custom ? sender.name : "");

  async function submit(body) {
    setSave({ state: "saving" });
    setErrors({});
    try {
      const data = await api("/api/settings/email", { method: "PUT", body: JSON.stringify(body) });
      setSender(data.sender);
      setForm({ email: data.sender.custom ? data.sender.email : "", name: data.sender.custom ? data.sender.name : "" });
      setSave({ state: "saved" });
    } catch (err) {
      setErrors(err.fields || {});
      setSave({ state: "error", message: err.message });
    }
  }

  async function sendTest() {
    setTest({ state: "sending" });
    try {
      const data = await api("/api/settings/email/test", { method: "POST" });
      setTest({ state: "ok", message: `Test email sent to ${data.to} from ${data.from}. Check your inbox (and spam).` });
    } catch (err) {
      setTest({ state: "error", message: err.message });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {!configured && (
          <Alert tone="warning" title="Email is not set up on the server">
            An administrator must add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS (or SENDGRID_API_KEY) to the server environment and restart the app.
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(form);
          }}
          noValidate
        >
          <Card>
            <CardHeader title="Your sender" description="The From address and name on emails your agents send you." />
            <CardBody className="space-y-5">
              <Field
                label="From email"
                htmlFor="from-email"
                error={errors.email}
                hint={`Leave empty to use the default (${sender.default.email}). Must be an ${domains} address that your mail server allows you to send from.`}
              >
                <Input
                  id="from-email"
                  type="email"
                  autoComplete="off"
                  placeholder={sender.default.email}
                  value={form.email}
                  invalid={!!errors.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="From name" htmlFor="from-name" error={errors.name} hint={`Optional. Default: ${sender.default.name}.`}>
                <Input
                  id="from-name"
                  maxLength={100}
                  placeholder={sender.default.name}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              {save.state === "error" && <Alert tone="error">{save.message}</Alert>}
              {save.state === "saved" && !dirty && <Alert tone="success">Saved.</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={save.state === "saving" || !dirty}>
                  {save.state === "saving" && <Spinner className="size-4 border-white/40 border-t-white" />}
                  Save
                </Button>
                {sender.custom && (
                  <Button type="button" variant="secondary" disabled={save.state === "saving"} onClick={() => submit({ email: "", name: "" })}>
                    Use default sender
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </form>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Currently used" />
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">From</p>
              <p className="mt-0.5 break-all text-ink">
                {sender.name} &lt;{sender.email}&gt;
              </p>
              <div className="mt-1">
                <Badge tone={sender.custom ? "success" : "neutral"}>{sender.custom ? "Your own sender" : "Default sender"}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">To</p>
              <p className="mt-0.5 break-all text-ink">{myEmail || "Your account email"}</p>
              <p className="mt-0.5 text-xs text-slate-500">Agent emails only ever go to the agent owner&apos;s own inbox.</p>
            </div>
            <Button type="button" variant="secondary" className="w-full" disabled={!configured || !myEmail || test.state === "sending" || dirty} onClick={sendTest}>
              {test.state === "sending" && <Spinner className="size-4" />}
              Send test email
            </Button>
            {dirty && <p className="text-xs text-slate-500">Save first, then send a test.</p>}
            {test.state === "ok" && <Alert tone="success">{test.message}</Alert>}
            {test.state === "error" && <Alert tone="error">{test.message}</Alert>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
