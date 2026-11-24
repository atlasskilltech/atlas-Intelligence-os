import { createConnection, listConnections, publicConnection } from "@/lib/connectors/http/apiConnectionRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

/** GET → { connections } (no secret values, only whether each secret is set) */
export async function GET() {
  try {
    return ok({ connections: (await listConnections()).map(publicConnection) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { connection } → { connection } (admins only) */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 100_000);
    if (!body.connection || typeof body.connection !== "object") throw new BadRequest("Missing connection.");
    const rec = await createConnection(getActor(), body.connection);
    return ok({ connection: publicConnection(rec) }, 201);
  } catch (err) {
    return fail(err);
  }
}
