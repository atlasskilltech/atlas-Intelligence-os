import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";
import { changeRole, deleteUser } from "@/lib/users/userRepo";

const idOf = async (params) => {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n < 1) throw new BadRequest("Invalid user id.");
  return n;
};

/** PATCH { role } → { user } (admins only) */
export async function PATCH(request, { params }) {
  try {
    const id = await idOf(params);
    const body = await readJsonBody(request);
    return ok({ user: await changeRole(await getActor(), id, body.role) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    return ok(await deleteUser(await getActor(), await idOf(params)));
  } catch (err) {
    return fail(err);
  }
}
