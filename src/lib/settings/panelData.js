import "server-only";
import { getAIStatus } from "../ai/index.js";
import { DEFAULT_PRICING } from "../ai/pricing.js";
import { listAgents } from "../agents/agentRepo.js";
import { getGoogleAuth, getStorageInfo, isAuthEnabled } from "../config/env.js";
import { TABLE_PREFIX, dbStatus } from "../db/mysql.js";
import { getUsageSummary } from "../usage/usageStore.js";
import { listUsers } from "../users/userRepo.js";
import { ELEVENLABS_MODELS, getModelSettings, LIMITS, MAX_ELEVENLABS_VOICES } from "./modelSettings.js";

/**
 * Data for the Settings popup tabs (Settings, Usage, Account), as plain JSON.
 * Never includes secrets: API keys and the Google client secret stay here.
 */
export const PANEL_TABS = ["settings", "usage", "account"];

export async function settingsPanelData() {
  return {
    temporary: getStorageInfo().temporary,
    settings: await getModelSettings(),
    status: getAIStatus(),
    limits: LIMITS,
    defaultPricing: DEFAULT_PRICING,
    elevenlabsModels: ELEVENLABS_MODELS,
    maxVoices: MAX_ELEVENLABS_VOICES,
  };
}

export async function usagePanelData(actor) {
  const settings = await getModelSettings();
  const [usage, agents] = await Promise.all([getUsageSummary({ days: 30, pricingOverrides: settings.pricingOverrides }), listAgents(actor)]);
  return {
    temporary: getStorageInfo().temporary,
    usage,
    inrRate: settings.inrPerUsd || 88,
    agentNames: Object.fromEntries(agents.map((a) => [a.id, a.config?.name || a.id])),
  };
}

export async function accountPanelData(actor) {
  if (actor.role !== "admin") return { isAdmin: false };
  const db = await dbStatus();
  let users = [];
  let loadError = null;
  if (db.connected) {
    try {
      users = await listUsers(actor);
    } catch (err) {
      loadError = err.publicMessage || "Could not load users.";
    }
  }
  const google = getGoogleAuth();
  return {
    isAdmin: true,
    db,
    google: google ? { configured: true, names: google.names } : { configured: false, names: [] },
    authEnabled: isAuthEnabled(),
    users,
    loadError,
    currentUid: actor.uid,
    tablePrefix: TABLE_PREFIX,
  };
}

export function panelData(tab, actor) {
  if (tab === "settings") return settingsPanelData();
  if (tab === "usage") return usagePanelData(actor);
  return accountPanelData(actor);
}
