import { notFound } from "next/navigation";
import HomeAssistant from "@/components/home/HomeAssistant";
import { ChatNotFound, getChat } from "@/lib/chats/chatRepo";
import { getPageActor } from "@/lib/context";

async function load(id) {
  try {
    return await getChat(await getPageActor(), id);
  } catch (err) {
    if (err instanceof ChatNotFound) return null;
    throw err;
  }
}

export async function generateMetadata({ params }) {
  const chat = await load((await params).id);
  return { title: chat ? chat.title : "Chat" };
}

/** A saved Home chat, reopened from the sidebar. Continue it right here. */
export default async function ChatPage({ params }) {
  const chat = await load((await params).id);
  if (!chat) notFound();
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 sm:px-6">
      <div className="flex w-full max-w-3xl flex-1 flex-col justify-end">
        <HomeAssistant
          key={chat.id}
          chatId={chat.id}
          initialThread={chat.messages.map((m) => ({ role: m.role, content: m.content, sources: m.sources || [] }))}
        />
      </div>
    </div>
  );
}
