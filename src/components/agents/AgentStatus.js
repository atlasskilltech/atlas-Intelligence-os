import Badge from "@/components/ui/Badge";

export const STATUS_META = {
  active: { label: "Active", tone: "success", dot: "bg-brand-500" },
  paused: { label: "Paused", tone: "warning", dot: "bg-amber-500" },
  draft: { label: "Draft", tone: "neutral", dot: "bg-slate-400" },
};

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <Badge tone={m.tone}>
      <span className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </Badge>
  );
}
