import { redirect } from "next/navigation";

/** Account is a tab of the Settings popup, never a page: old links open the popup over Home. */
export default function AccountRedirect() {
  redirect("/#settings/account");
}
