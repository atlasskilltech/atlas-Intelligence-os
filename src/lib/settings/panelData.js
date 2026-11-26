import "server-only";
import { getAIStatus } from "../ai/index.js";
import { DEFAULT_PRICING } from "../ai/pricing.js";
import { listAgents } from "../agents/agentRepo.js";
import { getEmailConfig, getGoogleAuth, getStorageInfo, isAuthEnabled } from "../config/env.js";
import { TABLE_PREFIX, dbStatus } from "../db/mysql.js";
import { getSenderFor } from "../email/senderSettings.js";
import { getUsageSummary } from "../usage/usageStore.js";
import { emailForActorId, listUsers } from "../users/userRepo.js";
import { ELEVENLABS_MODELS, getModelSettings, LIMITS, MAX_ELEVENLABS_VOICES } from "./modelSettings.js";

/**
 * Data for the Settings popup tabs (Account, Settings, Email sender, Usage), as
 * plain JSON. Never includes secrets: API keys, the mail password and the Google
 * client secret stay here.
 */
export const PANEL_TABS = ["settings", "email", "usage", "agents", "account"];

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

export async function emailPanelData(actor) {
  return { sender: await getSenderFor(actor.id), configured: Boolean(getEmailConfig()), myEmail: actor.email || "" };
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

/**
 * All Agents: who built how many agents, and what each agent has cost so far
 * (all-time tokens and estimated $ / ₹). Admins see everyone; others see their own.
 */
export async function agentsPanelData(actor) {
  const settings = await getModelSettings();
  const [agents, usage] = await Promise.all([
    listAgents(actor),
    getUsageSummary({ days: 3650, recent: 0, months: 1, pricingOverrides: settings.pricingOverrides }),
  ]);
  const used = new Map(usage.byAgent.map((r) => [r.key, r]));

  // Names and photos of people, when the user database is available (admins only).
  const people = new Map();
  if (actor.role === "admin") {
    try {
      if ((await dbStatus()).connected) for (const u of await listUsers(actor)) people.set(`u_${u.id}`, u);
    } catch {
      // Fall back to emails below.
    }
  }

  const owners = new Map();
  for (const a of agents) {
    const id = a.ownerId || "unknown";
    if (!owners.has(id)) {
      const person = people.get(id);
      owners.set(id, {
        ownerId: id,
        name: person?.name || (id === actor.id ? actor.name : ""),
        email: person?.email || a.ownerEmail || (id === actor.id ? actor.email : "") || "",
        picture: person?.picture || "",
        isYou: id === actor.id,
        agents: [],
      });
    }
    const u = used.get(a.id);
    owners.get(id).agents.push({
      id: a.id,
      name: a.config?.name || a.id,
      status: a.status,
      createdAt: a.createdAt,
      calls: u?.calls || 0,
      tokens: (u?.inputTokens || 0) + (u?.outputTokens || 0),
      costUsd: u?.costUsd || 0,
      unpricedCalls: u?.unpricedCalls || 0,
    });
  }
  // Older agents store no ownerEmail: look it up.
  await Promise.all(
    [...owners.values()].filter((o) => !o.email).map(async (o) => (o.email = (await emailForActorId(o.ownerId)) || "")),
  );

  const sum = (list, k) => list.reduce((n, x) => n + (x[k] || 0), 0);
  const list = [...owners.values()].map((o) => {
    o.agents.sort((x, y) => y.costUsd - x.costUsd || y.tokens - x.tokens);
    return {
      ...o,
      agentCount: o.agents.length,
      activeCount: o.agents.filter((x) => x.status === "active").length,
      tokens: sum(o.agents, "tokens"),
      costUsd: sum(o.agents, "costUsd"),
      unpricedCalls: sum(o.agents, "unpricedCalls"),
    };
  });
  list.sort((x, y) => y.costUsd - x.costUsd || y.agentCount - x.agentCount);

  return {
    isAdmin: actor.role === "admin",
    inrRate: settings.inrPerUsd || 88,
    owners: list,
    totals: {
      people: list.length,
      agents: agents.length,
      active: sum(list, "activeCount"),
      tokens: sum(list, "tokens"),
      costUsd: sum(list, "costUsd"),
    },
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
  if (tab === "email") return emailPanelData(actor);
  if (tab === "usage") return usagePanelData(actor);
  if (tab === "agents") return agentsPanelData(actor);
  return accountPanelData(actor);
}
