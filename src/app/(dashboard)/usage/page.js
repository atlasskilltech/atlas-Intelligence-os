import { redirect } from "next/navigation";

/** Usage is a tab of the Settings popup, never a page: old links open the popup over Home. */
export default function UsageRedirect() {
  redirect("/#settings/usage");
}
