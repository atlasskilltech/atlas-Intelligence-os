import Button from "@/components/ui/Button";
import ComingSoon from "@/components/ui/ComingSoon";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "My Agents" };

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        title="My Agents"
        description="Run, pause, resume, edit or delete the agents you have created."
        actions={
          <Button href="/agents/new">
            <Icon name="plus" className="size-4" />
            Create agent
          </Button>
        }
      />
      <ComingSoon
        milestone={4}
        icon="bot"
        title="No agents yet"
        description="Saved agents will be listed here with their status, next scheduled run and last result."
        action={<Button href="/agents/new" variant="secondary">Start with a prompt</Button>}
      />
    </>
  );
}
