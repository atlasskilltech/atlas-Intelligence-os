import { ConnectionError, getConnection } from "@/lib/connectors/http/apiConnectionRepo";
import { ToolInputError, callEndpoint } from "@/lib/connectors/http/httpApiConnector";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;

const PREVIEW_MAX = 8_000;

/**
 * POST { endpoint, params? } → { result: { ok, status, durationMs, preview, truncated } | { ok: false, error } }
 * Admins only. Only GET endpoints can be tested here — POST endpoints change data.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (getActor().role !== "admin") throw new ConnectionError("Only administrators can test API connections.", 403);
    const body = await readJsonBody(request);
    const connection = await getConnection(id);
    const endpoint = connection.endpoints.find((e) => e.id === body.endpoint);
    if (!endpoint) throw new BadRequest("Choose an endpoint to test.");
    if (endpoint.method !== "GET") throw new BadRequest("Only GET endpoints can be tested here, because POST endpoints change data.");
    const values = Object.fromEntries(
      Object.entries(body.params && typeof body.params === "object" ? body.params : {}).filter(([, v]) => v !== "" && v != null),
    );
    try {
      const r = await callEndpoint({ apiId: id, endpointId: endpoint.id, method: "GET", params: values, allowDisabled: true });
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
      // The call failed (network, guard, HTTP status): report it as a test result, not a server error.
      const message = err instanceof ToolInputError || err?.message ? err.message : "Request failed.";
      return ok({ result: { ok: false, error: message } });
    }
  } catch (err) {
    return fail(err);
  }
}
