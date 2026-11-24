import Badge from "./Badge";
import { EmptyState } from "./States";

/** Honest placeholder for a page whose feature lands in a later milestone. */
export default function ComingSoon({ milestone, icon, title, description, action }) {
  return (
    <div>
      <div className="mb-3">
        <Badge tone="brand">Available in Milestone {milestone}</Badge>
      </div>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}
