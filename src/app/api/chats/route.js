import { listChats } from "@/lib/chats/chatRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

/** GET → { chats: [{ id, title, createdAt, updatedAt }] } (your own, newest first) */
export async function GET() {
  try {
    return ok({ chats: await listChats(await getActor()) });
  } catch (err) {
    return fail(err);
  }
}
