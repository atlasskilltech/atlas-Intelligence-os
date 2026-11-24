import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { addUser, listUsers } from "@/lib/users/userRepo";

/** GET → { users } (admins only) */
export async function GET() {
  try {
    return ok({ users: await listUsers(await getActor()) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { email, name?, role } → { user } (admins only) */
export async function POST(request) {
  try {
    const body = await readJsonBody(request);
    return ok({ user: await addUser(await getActor(), body) }, 201);
  } catch (err) {
    return fail(err);
  }
}
