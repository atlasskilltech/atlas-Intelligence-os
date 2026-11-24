import ComingSoon from "@/components/ui/ComingSoon";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "Execution History" };

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Execution History"
        description="Every agent run with its trigger, status, duration and result."
      />
      <ComingSoon
        milestone={5}
        icon="history"
        title="No runs yet"
        description="Runs will appear here once the execution engine is in place. You'll be able to filter by agent and status."
      />
    </>
  );
}
