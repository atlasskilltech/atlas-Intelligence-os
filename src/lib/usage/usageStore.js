import "server-only";
import { estimateCost } from "../ai/pricing.js";
import { appendJsonLine, readJsonLines } from "../storage/jsonFile.js";

/**
 * Usage log: one JSON line per AI call in DATA_DIR/usage.jsonl.
 * Later this becomes a database table with the same fields.
 */
const FILE = "usage.jsonl";

export async function recordUsage(entry) {
  await appendJsonLine(FILE, { ts: new Date().toISOString(), ...entry });
}

const empty = () => ({ calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0 });

function add(acc, e) {
  acc.calls += 1;
  if (!e.ok) acc.failed += 1;
  acc.inputTokens += e.inputTokens || 0;
  acc.outputTokens += e.outputTokens || 0;
  if (e.ok && e.costUsd == null && (e.inputTokens || e.outputTokens)) acc.unpricedCalls += 1;
  acc.costUsd += e.costUsd || 0;
  return acc;
}

/** Totals, per-model, per-purpose and per-day breakdowns for the last `days` days. */
export async function getUsageSummary({ days = 30, recent = 20, pricingOverrides = {} } = {}) {
  const since = Date.now() - days * 86_400_000;
  // Backfill cost for calls logged before a price was set, using current prices.
  const entries = (await readJsonLines(FILE))
    .filter((e) => Date.parse(e.ts) >= since)
    .map((e) => {
      if (e.costUsd != null) return e;
      const cost = estimateCost(e.responseModel || e.model, e, pricingOverrides);
      return cost == null ? e : { ...e, costUsd: cost };
    });

  const totals = empty();
  const byModel = {};
  const byPurpose = {};
  const byAgent = {};
  const byDay = {};
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const thisMonth = empty();

  for (const e of entries) {
    add(totals, e);
    add((byModel[e.model || "unknown"] ??= empty()), e);
    add((byPurpose[e.purpose || "other"] ??= empty()), e);
    if (e.agentId) add((byAgent[e.agentId] ??= empty()), e);
    add((byDay[e.ts.slice(0, 10)] ??= empty()), e);
    if (Date.parse(e.ts) >= monthStart.getTime()) add(thisMonth, e);
  }

  const round = (o) => ({ ...o, costUsd: Math.round(o.costUsd * 1e6) / 1e6 });
  const mapRound = (m) =>
    Object.entries(m)
      .map(([key, v]) => ({ key, ...round(v) }))
      .sort((a, b) => b.calls - a.calls);

  return {
    days,
    totals: round(totals),
    thisMonth: round(thisMonth),
    byModel: mapRound(byModel),
    byPurpose: mapRound(byPurpose),
    byAgent: mapRound(byAgent),
    byDay: mapRound(byDay).sort((a, b) => b.key.localeCompare(a.key)),
    recent: entries.slice(-recent).reverse(),
  };
}
