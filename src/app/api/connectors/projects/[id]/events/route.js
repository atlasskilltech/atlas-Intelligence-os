import { MAX_EVENT_BYTES, receiveEvent } from "@/lib/connectors/projects/projectEvents";
import { fail, ok } from "@/lib/http/respond";

/**
 * POST ← a two-way ATLAS project (CRM, Career Services) reporting a change to
 * its own agents. PUBLIC in the login gate (src/proxy.js): the project has no
 * IntelligenceOS session. It is authenticated by the x-atlas-signature HMAC
 * with the secret IntelligenceOS gave it at registration; anything else is 401.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_EVENT_BYTES) return Response.json({ error: "Body too large." }, { status: 413 });
    const raw = await request.text();
    const r = await receiveEvent(id, raw, request.headers);
    return ok({ received: true, ...(r.duplicate ? { duplicate: true } : {}) });
  } catch (err) {
    return fail(err);
  }
}
