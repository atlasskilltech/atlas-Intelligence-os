import { connection } from "next/server";
import HomeBody from "@/components/home/HomeBody";

export const metadata = { title: "Home" };

export default async function HomePage() {
  await connection();
  return <HomeBody />;
}
