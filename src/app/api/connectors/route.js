import { connection } from "next/server";
import { connectorOverview } from "@/lib/connectors";
import { fail, ok } from "@/lib/http/respond";

/** GET → { connectors: [{ id, name, ready, message, actions, ... }] } */
export async function GET() {
  try {
    await connection();
    return ok({ connectors: await connectorOverview() });
  } catch (err) {
    return fail(err);
  }
}
