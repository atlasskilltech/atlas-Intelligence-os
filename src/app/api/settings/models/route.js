import { getActor } from "@/lib/context";
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
    if ((await getActor()).role !== "admin") {
      throw Object.assign(new Error("forbidden"), { publicMessage: "Only administrators can change model settings.", status: 403, type: "forbidden" });
    }
    const body = await readJsonBody(request);
    const result = await updateModelSettings(body);
    if (!result.ok) throw new BadRequest("Please fix the highlighted fields.", result.errors);
    return ok({ settings: result.value });
  } catch (err) {
    return fail(err);
  }
}
