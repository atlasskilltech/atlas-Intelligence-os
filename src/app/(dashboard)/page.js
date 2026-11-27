import { connection } from "next/server";
import HomeBody from "@/components/home/HomeBody";
import { currentActor } from "@/lib/context";

export const metadata = { title: "Home" };

export default async function HomePage() {
  await connection();
  const actor = await currentActor();
  return <HomeBody name={actor && !actor.local ? actor.name : null} />;
}
