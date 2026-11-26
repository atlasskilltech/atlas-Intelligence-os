import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir } from "../config/env.js";
import { readJson, updateJson } from "../storage/jsonFile.js";

/**
 * Datasets of a run: big arrays moved out of tool results (see engine/dataTool.js)
 * so the agent can query them with query_data. One file per run
 * (`<runId>.data.json`), kept apart from the run file so normal run saves stay
 * small. Deleted when the run finishes.
 */

const MAX_DATASETS = 20;
const fileOf = (runId) => `${runId}.data.json`;

/** Adds datasets ([{ id, rows, ... }]) to the run's file; the oldest are dropped past the cap. */
export async function saveDatasets(runId, datasets) {
  if (!datasets.length) return;
  await updateJson(fileOf(runId), { datasets: {} }, (d) => {
    const all = { ...(d?.datasets || {}) };
    for (const ds of datasets) all[ds.id] = ds.rows;
    const ids = Object.keys(all);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_DATASETS))) delete all[id];
    return { value: { datasets: all }, result: null };
  });
}

/** Rows of one dataset, or null. */
export async function loadDataset(runId, id) {
  const d = await readJson(fileOf(runId), null);
  const rows = d?.datasets?.[id];
  return Array.isArray(rows) ? rows : null;
}

/** All datasets of a run as { id: rows }. */
export async function loadDatasets(runId) {
  const d = await readJson(fileOf(runId), null);
  return d?.datasets || {};
}

/** Best effort; never throws. */
export async function removeDatasets(runId) {
  try {
    await fs.rm(path.resolve(getDataDir(), fileOf(runId)), { force: true });
  } catch {}
}

export const DATASET_CAP = MAX_DATASETS;
