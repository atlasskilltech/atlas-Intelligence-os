"use client";

import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/States";

export default function DashboardError({ error, reset }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Alert tone="error" title="Something went wrong on this page">
        {/* Never show raw error details: they may contain internal information. */}
        Please try again. If the problem continues, contact the IntelligenceOS team
        {error?.digest ? ` and mention reference ${error.digest}` : ""}.
      </Alert>
      <div className="mt-4">
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
