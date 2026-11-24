import ComingSoon from "@/components/ui/ComingSoon";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "API Usage" };

export default function UsagePage() {
  return (
    <>
      <PageHeader
        title="API Usage"
        description="Tokens used and estimated AI cost by day, agent and model."
      />
      <ComingSoon
        milestone={2}
        icon="chart"
        title="No usage recorded yet"
        description="Every AI call will be logged with its token count and estimated cost once the provider is connected."
      />
    </>
  );
}
