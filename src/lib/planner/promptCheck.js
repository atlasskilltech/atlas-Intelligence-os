/**
 * Client-safe check for a task description before it is sent to the planner.
 *
 * A fragment such as "Below, यह एजेंट" (a voice-typing slip or cut-off paste)
 * passes the server's length check but gives the planner nothing to plan, so it
 * builds a "please clarify" agent with no data tools. This catches that early so
 * the builder can warn the employee and let them fix the text first.
 *
 * Returns null when the text looks like a task, or a plain-language reason.
 */
export const TASK_MIN_WORDS = 5;
export const TASK_MIN_LETTERS = 20;

export function shortTaskReason(text) {
  const t = String(text || "").trim();
  // Words in any script (Latin, Devanagari…); bare punctuation/numbers don't count.
  const words = t.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (words.length < TASK_MIN_WORDS || letters < TASK_MIN_LETTERS) {
    return `This is only ${words.length} word${words.length === 1 ? "" : "s"}, which is usually too little for the AI to plan an agent. Describe what the agent should do, which data it should use, and what you want back (for example a report or a notification).`;
  }
  return null;
}
