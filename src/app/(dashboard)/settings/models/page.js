import { redirect } from "next/navigation";

/** Settings is a tab of the Settings popup, never a page: old links open the popup over Home. */
export default function SettingsRedirect() {
  redirect("/#settings/settings");
}
