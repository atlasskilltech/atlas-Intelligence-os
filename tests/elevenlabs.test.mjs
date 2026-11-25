// ElevenLabs text-to-speech provider and the voice provider setting. Run with: npm test
// Uses a fake fetch, so no API key or network is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createElevenLabsProvider, normalizeCredits } from "../src/lib/ai/providers/elevenlabs.js";
import { AIError } from "../src/lib/ai/errors.js";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-test-"));
const { validateModelSettings, getModelSettings, updateModelSettings } = await import("../src/lib/settings/modelSettings.js");

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const { status = 200, json, bytes } = handler(String(url), init);
    if (bytes) return new Response(bytes, { status, headers: { "content-type": "audio/mpeg" } });
    return new Response(JSON.stringify(json ?? {}), { status, headers: { "content-type": "application/json" } });
  };
  fn.calls = calls;
  return fn;
}

test("speak sends text, model and key to the voice and returns mp3 bytes", async () => {
  const fetch = fakeFetch(() => ({ bytes: new Uint8Array([1, 2, 3]) }));
  const p = createElevenLabsProvider({ apiKey: "xi-test-key-123", fetch });
  const res = await p.speak({ text: "Namaste", voiceId: "voice1", model: "eleven_multilingual_v2" });
  assert.deepEqual([...res.audio], [1, 2, 3]);
  assert.equal(res.characters, 7);
  const call = fetch.calls[0];
  assert.match(call.url, /\/v1\/text-to-speech\/voice1\?output_format=mp3/);
  assert.equal(call.init.headers["xi-api-key"], "xi-test-key-123");
  assert.deepEqual(JSON.parse(call.init.body), { text: "Namaste", model_id: "eleven_multilingual_v2" });
});

test("credits used up → quota error (so the app falls back to OpenAI)", async () => {
  const fetch = fakeFetch(() => ({ status: 401, json: { detail: { status: "quota_exceeded", message: "This request exceeds your quota." } } }));
  const p = createElevenLabsProvider({ apiKey: "xi-test-key-123", fetch });
  await assert.rejects(p.speak({ text: "hi", voiceId: "v", model: "m" }), (e) => e instanceof AIError && e.type === "quota" && !e.retryable);
});

test("other errors map to auth / permission / rate_limit / server", async () => {
  const cases = [
    [{ status: 401, json: { detail: { status: "invalid_api_key", message: "bad" } } }, "auth"],
    [{ status: 401, json: { detail: { status: "detected_unusual_activity", message: "blocked" } } }, "permission"],
    [{ status: 429, json: { detail: "slow down" } }, "rate_limit"],
    [{ status: 503, json: {} }, "server"],
  ];
  for (const [reply, type] of cases) {
    const p = createElevenLabsProvider({ apiKey: "xi-test-key-123", fetch: fakeFetch(() => reply) });
    await assert.rejects(p.speak({ text: "hi", voiceId: "v", model: "m" }), (e) => e.type === type);
  }
});

test("no key → not_configured", async () => {
  await assert.rejects(createElevenLabsProvider({}).speak({ text: "hi" }), (e) => e.type === "not_configured");
});

test("credits balance is normalized", async () => {
  const fetch = fakeFetch(() => ({
    json: { tier: "free", character_count: 9200, character_limit: 10000, next_character_count_reset_unix: 1767225600, status: "active" },
  }));
  const c = await createElevenLabsProvider({ apiKey: "xi-test-key-123", fetch }).getCredits();
  assert.equal(c.used, 9200);
  assert.equal(c.remaining, 800);
  assert.equal(c.percentUsed, 92);
  assert.equal(c.tier, "free");
  assert.equal(c.resetsAt, new Date(1767225600 * 1000).toISOString());
  assert.equal(normalizeCredits({ character_count: 5, character_limit: 0 }).percentUsed, 100);
});

test("voiceProvider setting: default openai, accepts elevenlabs, rejects others", async () => {
  assert.equal((await getModelSettings()).voiceProvider, "openai");
  assert.equal(validateModelSettings({ voiceProvider: "google" }).ok, false);
  const r = await updateModelSettings({ voiceProvider: "elevenlabs" });
  assert.equal(r.ok, true);
  assert.equal((await getModelSettings()).voiceProvider, "elevenlabs");
});

test("ElevenLabs voice ID and model are saved from Model Settings", async () => {
  assert.equal(validateModelSettings({ elevenlabsVoiceId: "bad id!" }).ok, false);
  assert.equal(validateModelSettings({ elevenlabsModel: "Eleven V3" }).ok, false);
  const r = await updateModelSettings({ elevenlabsVoiceId: " pNInz6obpgDQGcFmaJgB ", elevenlabsModel: "eleven_v3" });
  assert.equal(r.ok, true);
  const s = await getModelSettings();
  assert.equal(s.elevenlabsVoiceId, "pNInz6obpgDQGcFmaJgB");
  assert.equal(s.elevenlabsModel, "eleven_v3");
});

test("several ElevenLabs voices can be saved and switched", async () => {
  const voices = [
    { id: "pNInz6obpgDQGcFmaJgB", name: "Aarush" },
    { id: "XrExE9yKIg1WjnnlVkGX", name: "Bunty" },
  ];
  let r = await updateModelSettings({ elevenlabsVoices: voices, elevenlabsVoiceId: "XrExE9yKIg1WjnnlVkGX" });
  assert.equal(r.ok, true);
  assert.equal((await getModelSettings()).elevenlabsVoiceId, "XrExE9yKIg1WjnnlVkGX");
  r = await updateModelSettings({ elevenlabsVoices: voices, elevenlabsVoiceId: "pNInz6obpgDQGcFmaJgB" });
  assert.equal((await getModelSettings()).elevenlabsVoiceId, "pNInz6obpgDQGcFmaJgB");
  assert.deepEqual((await getModelSettings()).elevenlabsVoices, voices);
  // active voice must be one of the saved ones; duplicates and bad IDs are refused
  assert.equal(validateModelSettings({ elevenlabsVoices: voices, elevenlabsVoiceId: "AAAAAAAAAAAAAAAAAAAA" }).ok, false);
  assert.equal(validateModelSettings({ elevenlabsVoices: [voices[0], voices[0]] }).ok, false);
  assert.equal(validateModelSettings({ elevenlabsVoices: [{ id: "x y", name: "Bad" }] }).ok, false);
  assert.equal(validateModelSettings({ elevenlabsVoices: [{ id: "pNInz6obpgDQGcFmaJgB", name: "" }] }).ok, false);
});
