import ComingSoon from "@/components/ui/ComingSoon";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "Execution Logs" };

export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Execution Logs"
        description="Step-by-step detail of what each agent decided, which tools it used and what happened."
      />
      <ComingSoon
        milestone={5}
        icon="terminal"
        title="No logs yet"
        description="Each run will show a timeline: AI decisions, tool calls (with secrets hidden), retries, approvals and the final report."
      />
    </>
  );
}
