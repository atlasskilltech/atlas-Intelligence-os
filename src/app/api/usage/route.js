import { fail, ok } from "@/lib/http/respond";
import { getUsageSummary } from "@/lib/usage/usageStore";

export async function GET(request) {
  try {
    const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
    return ok(await getUsageSummary({ days }));
  } catch (err) {
    return fail(err);
  }
}
