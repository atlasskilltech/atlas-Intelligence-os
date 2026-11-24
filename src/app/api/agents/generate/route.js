import { normalizeAgentConfig } from "@/lib/agents/agentConfig";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";
import { PROMPT_MAX, PROMPT_MIN, generateAgent, refineAgent } from "@/lib/planner/planner";

// Planning with a reasoning model can take a while; allow up to 2 minutes (Vercel honours this).
export const maxDuration = 120;

function checkText(value, label) {
  if (typeof value !== "string") throw new BadRequest(`${label} is required.`);
  const text = value.trim();
  if (text.length < PROMPT_MIN) throw new BadRequest(`${label} is too short — describe the task in a sentence or two.`);
  if (text.length > PROMPT_MAX) throw new BadRequest(`${label} is too long (max ${PROMPT_MAX} characters).`);
  return text;
}

/**
 * POST { prompt }                 → generate a new agent draft
 * POST { agent, instruction }     → revise an existing draft
 * Returns { agent, warnings, meta: { model, usage, costUsd, latencyMs } }.
 */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 100_000);

    if (body.agent !== undefined) {
      const instruction = checkText(body.instruction, "Change request");
      if (!body.agent || typeof body.agent !== "object") throw new BadRequest("Invalid agent draft.");
      // Never trust a client-supplied draft: re-normalise it before sending it to the model.
      const { config } = normalizeAgentConfig(body.agent);
      return ok(await refineAgent(config, instruction));
    }

    const prompt = checkText(body.prompt, "Task description");
    return ok(await generateAgent(prompt));
  } catch (err) {
    return fail(err);
  }
}
