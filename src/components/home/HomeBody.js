import { PROMPT_SUGGESTIONS } from "@/components/agents/suggestions";
import HomeAssistant from "@/components/home/HomeAssistant";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Home: greeting + the Chat / Agent prompt. Also shown behind the Settings popup. */
export default function HomeBody() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-6 sm:px-6">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-brand-600">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Ask anything, or automate a task
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            Ask a question like &ldquo;how many requests are pending?&rdquo; and get the answer straight away. Describe
            recurring work and IntelligenceOS turns it into an agent you review before anything runs.
          </p>
        </div>

        <HomeAssistant suggestions={PROMPT_SUGGESTIONS} />
      </div>
    </div>
  );
}
