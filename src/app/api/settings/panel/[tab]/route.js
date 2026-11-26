import { getActor } from "@/lib/context";
import { BadRequest, fail, ok } from "@/lib/http/respond";
import { PANEL_TABS, panelData } from "@/lib/settings/panelData";

/** GET /api/settings/panel/<settings|usage|account> → that Settings popup tab's data. */
export async function GET(_request, { params }) {
  try {
    const { tab } = await params;
    if (!PANEL_TABS.includes(tab)) throw new BadRequest("Unknown settings tab.");
    return ok(await panelData(tab, await getActor()));
  } catch (err) {
    return fail(err);
  }
}
