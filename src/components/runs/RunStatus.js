import Badge from "@/components/ui/Badge";

export const RUN_STATUS = {
  queued: { label: "Queued", tone: "neutral", live: true },
  running: { label: "Running", tone: "brand", live: true },
  waiting_approval: { label: "Needs approval", tone: "warning", live: true },
  succeeded: { label: "Succeeded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  timed_out: { label: "Timed out", tone: "danger" },
};

export function RunStatusBadge({ status }) {
  const s = RUN_STATUS[status] || { label: status, tone: "neutral" };
  return (
    <Badge tone={s.tone}>
      {s.live && status !== "waiting_approval" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}

export function ModeBadge({ mode }) {
  return mode === "test" ? <Badge tone="neutral">Test</Badge> : <Badge tone="brand">Live</Badge>;
}
