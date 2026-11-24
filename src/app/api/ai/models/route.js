import { listAvailableModels } from "@/lib/ai";
import { fail, ok } from "@/lib/http/respond";

export async function GET() {
  try {
    return ok({ models: await listAvailableModels() });
  } catch (err) {
    return fail(err);
  }
}
