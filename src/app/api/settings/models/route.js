import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";
import { getModelSettings, updateModelSettings } from "@/lib/settings/modelSettings";

export async function GET() {
  try {
    return ok({ settings: await getModelSettings() });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request) {
  try {
    const body = await readJsonBody(request);
    const result = await updateModelSettings(body);
    if (!result.ok) throw new BadRequest("Please fix the highlighted fields.", result.errors);
    return ok({ settings: result.value });
  } catch (err) {
    return fail(err);
  }
}
