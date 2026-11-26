import { redirect } from "next/navigation";

/** Email sender is a tab of the Settings popup, never a page: old links open the popup over Home. */
export default function EmailSenderRedirect() {
  redirect("/#settings/email");
}
