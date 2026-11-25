"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { api } from "./ProjectsSection";

const when = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—";

/**
 * §2c: the project lists the IntelligenceOS agents that use it. Shows the last
 * push outcome and, for administrators, "Send agents now" (a full snapshot).
 */
export default function IntosAgentsPush({ project, isAdmin, onProject }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const push = project.agentPush || null;

  async function sendNow() {
    setBusy(true);
    setMessage(null);
    try {
      const d = await api(`/api/connectors/projects/${project.id}/intos-agents`, { method: "POST" });
      onProject?.(d.project);
      setMessage(
        d.push.ok
          ? { tone: "success", text: `${d.push.count} agent${d.push.count === 1 ? "" : "s"} sent to ${project.name}.` }
          : { tone: "error", text: d.push.error || "The project refused the agents." },
      );
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Our agents in ${project.name}`}
        description={`${project.name} lists every IntelligenceOS agent that uses it, so its administrators can see which agents work on their data. Changes are sent automatically.`}
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!push ? (
            <Badge tone="warning">Not sent yet</Badge>
          ) : push.ok ? (
            <Badge tone="success">In sync</Badge>
          ) : (
            <Badge tone="danger">Last send failed</Badge>
          )}
          <span className="text-xs text-slate-500">
            {push ? `${push.ids?.length || 0} agent${push.ids?.length === 1 ? "" : "s"} listed there · last sent ${when(push.lastOkAt)}` : "Nothing sent yet."}
          </span>
          {isAdmin && (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={sendNow} disabled={busy}>
              {busy ? <Spinner className="size-3.5" /> : <Icon name="history" className="size-3.5" />} Send agents now
            </Button>
          )}
        </div>
        {push && !push.ok && push.error && <Alert tone="warning">{push.error}</Alert>}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </CardBody>
    </Card>
  );
}
