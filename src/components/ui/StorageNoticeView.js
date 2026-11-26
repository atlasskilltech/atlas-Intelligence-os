import { Alert } from "./States";

/** Warns when data is only kept temporarily (Vercel serverless, no database yet). Pure: `temporary` comes from the server. */
export default function StorageNoticeView({ temporary, what = "Settings and usage history", children }) {
  if (!temporary) return null;
  return (
    <Alert tone="warning" className="mb-6" title="Temporary storage on Vercel">
      {children ?? (
        <>
      {what} are saved in the server&apos;s temporary folder and can reset whenever Vercel restarts the app. To make model
      choices permanent, set <code className="font-mono">OPENAI_DEFAULT_MODEL</code> and{" "}
      <code className="font-mono">OPENAI_PLANNER_MODEL</code> in Vercel&apos;s environment variables. Permanent storage
      comes with the database.
        </>
      )}
    </Alert>
  );
}
