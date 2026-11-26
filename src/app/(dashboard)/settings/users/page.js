import { connection } from "next/server";
import AccountContent from "@/components/users/AccountContent";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  await connection();
  return <AccountContent />;
}
