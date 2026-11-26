import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { getSenderFor, saveSenderFor } from "@/lib/email/senderSettings";

/** The signed-in user's own email sender (From address + name for agent emails). */
export async function GET() {
  try {
    const actor = await getActor();
    return ok({ sender: await getSenderFor(actor.id) });
  } catch (err) {
    return fail(err);
  }
}

/** Body: { email, name }. Empty email = use the default sender again. */
export async function PUT(request) {
  try {
    const actor = await getActor();
    const body = await readJsonBody(request, 4_000);
    return ok({ sender: await saveSenderFor(actor, { email: body?.email, name: body?.name }) });
  } catch (err) {
    return fail(err);
  }
}
