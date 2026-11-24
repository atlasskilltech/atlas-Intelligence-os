import { deleteConnection, getConnection, publicConnection, updateConnection } from "@/lib/connectors/http/apiConnectionRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ connection: publicConnection(await getConnection(id)) });
  } catch (err) {
    return fail(err);
  }
}

/** PUT { connection } → { connection } (admins only; the id cannot change) */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request, 100_000);
    if (!body.connection || typeof body.connection !== "object") throw new BadRequest("Missing connection.");
    return ok({ connection: publicConnection(await updateConnection(getActor(), id, body.connection)) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    return ok(await deleteConnection(getActor(), id));
  } catch (err) {
    return fail(err);
  }
}
