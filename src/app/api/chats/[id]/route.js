import { deleteChat, getChat } from "@/lib/chats/chatRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ chat: await getChat(await getActor(), id) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    await deleteChat(await getActor(), id);
    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
