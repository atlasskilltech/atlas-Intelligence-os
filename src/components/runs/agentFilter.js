/**
 * Agent filter options for history pages: every agent that has runs, by current
 * name; deleted agents keep their last run's name, marked "(deleted)".
 * `agents` = agent records, `runs` = run summaries (newest first).
 * Returns { options: [{ id, name }], pick(raw) → id | null, nameOf(id) }.
 */
export function agentFilterOptions(agents, runs) {
  const current = new Map(agents.map((a) => [a.id, a.config.name]));
  const seen = new Map();
  for (const r of runs) if (!seen.has(r.agentId)) seen.set(r.agentId, current.get(r.agentId) || `${r.agentName} (deleted)`);
  const options = [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    options,
    pick: (raw) => (typeof raw === "string" && seen.has(raw) ? raw : null),
    nameOf: (id) => seen.get(id) || id,
  };
}
