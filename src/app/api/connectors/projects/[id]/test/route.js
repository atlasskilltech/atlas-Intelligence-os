import { callAction } from "@/lib/connectors/projects/projectConnector";
import { ProjectError, getProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;
const PREVIEW_MAX = 8_000;

/** POST { action, params? } → { result }. Admins only; read actions only (writes change real data). */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const actor = await getActor();
    if (actor.role !== "admin") throw new ProjectError("Only administrators can test projects.", 403);
    const body = await readJsonBody(request);
    const project = await getProject(id);
    const action = project.manifest.actions.find((a) => a.id === body.action);
    if (!action) throw new BadRequest("Choose an action to test.");
    if (action.risk !== "read") throw new BadRequest("Only read actions can be tested here, because the others change data.");
    const values = Object.fromEntries(
      Object.entries(body.params && typeof body.params === "object" ? body.params : {}).filter(([, v]) => v !== "" && v != null),
    );
    try {
      const r = await callAction({ projectId: id, actionId: action.id, tool: "read", params: values, userEmail: actor.email || null, allowDisabled: true });
      const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
      return ok({
        result: {
          ok: true,
          status: r.status,
          durationMs: r.durationMs,
          truncated: r.truncated || text.length > PREVIEW_MAX,
          preview: text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}\n…` : text,
        },
      });
    } catch (err) {
      return ok({ result: { ok: false, error: err?.message || "Request failed." } });
    }
  } catch (err) {
    return fail(err);
  }
}
