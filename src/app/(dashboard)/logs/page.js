import { redirect } from "next/navigation";

// Execution Logs is now the "Logs" tab of the Execution page. Keep this path
// working for old links and bookmarks.
export default function LogsRedirect() {
  redirect("/runs?tab=logs");
}
