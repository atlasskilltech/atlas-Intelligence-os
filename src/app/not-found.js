import Button from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <EmptyState
        className="w-full"
        icon="alert"
        title="Page not found"
        description="The page you are looking for doesn't exist or has moved."
        action={<Button href="/">Back to overview</Button>}
      />
    </div>
  );
}
