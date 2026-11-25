/**
 * Runs once when the Next.js server starts. Starts the agent scheduler on an
 * always-on Node server (not during `next build`, not on Vercel, not when
 * SCHEDULER_ENABLED=false). See src/lib/scheduler/scheduler.js.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/scheduler/scheduler.js");
  startScheduler();
}
