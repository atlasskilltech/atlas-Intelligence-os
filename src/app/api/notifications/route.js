import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";
import { listNotifications, markAllRead } from "@/lib/notifications/notificationRepo";

export async function GET() {
  try {
    return ok(await listNotifications(getActor()));
  } catch (err) {
    return fail(err);
  }
}

/** POST → mark all as read */
export async function POST() {
  try {
    await markAllRead(getActor());
    return ok(await listNotifications(getActor()));
  } catch (err) {
    return fail(err);
  }
}
