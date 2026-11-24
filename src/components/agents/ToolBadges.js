import Badge from "@/components/ui/Badge";
import { RISK_LEVELS, getTool, isToolAvailable } from "@/lib/catalog/toolCatalog";

export function RiskBadge({ risk }) {
  const r = RISK_LEVELS[risk];
  if (!r) return null;
  return <Badge tone={r.tone}>{r.label}</Badge>;
}

export function AvailabilityBadge({ toolId }) {
  const tool = getTool(toolId);
  if (!tool) return null;
  return isToolAvailable(toolId) ? (
    <Badge tone="success">Ready</Badge>
  ) : (
    <Badge tone="neutral">Connector in Milestone {tool.availableIn}</Badge>
  );
}

export function ApprovalBadge() {
  return <Badge tone="warning">Needs your approval</Badge>;
}
