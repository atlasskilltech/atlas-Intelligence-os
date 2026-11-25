"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadSelectedConnectors } from "@/components/agents/ConnectorPicker";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import ParticleOrb from "./ParticleOrb";
import { connectRealtime } from "./realtimeClient";

/**
 * Voice assistant, in the style of ChatGPT's voice mode:
 * tap the orb → speak → it detects when you stop → transcribes (any language) →
 * answers with the same assistant as Home (read-only connector lookups) → speaks the
 * answer → listens again. Hindi, English, Hinglish and other languages work.
 *
 * Two engines:
 * - "realtime" (default): OpenAI Realtime speech-to-speech over WebRTC — semantic
 *   turn detection, speak-to-interrupt, ~0.5 s replies. Routes: /api/voice/realtime(/tool,/usage).
 * - "classic" (fallback): record → /api/voice/transcribe → /api/chat → /api/voice/speak.
 * If realtime cannot start, classic is used automatically.
 */

export const LANGUAGES = [
  { code: "", label: "Auto (any language)" },
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी · Hindi" },
  { code: "mr", label: "मराठी · Marathi" },
  { code: "gu", label: "ગુજરાતી · Gujarati" },
  { code: "bn", label: "বাংলা · Bengali" },
  { code: "pa", label: "ਪੰਜਾਬੀ · Punjabi" },
  { code: "ta", label: "தமிழ் · Tamil" },
  { code: "te", label: "తెలుగు · Telugu" },
  { code: "kn", label: "ಕನ್ನಡ · Kannada" },
  { code: "ml", label: "മലയാളം · Malayalam" },
  { code: "ur", label: "اردو · Urdu" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ar", label: "العربية · Arabic" },
];

// Voices available in both engines (Realtime and text-to-speech).
export const VOICES = [
  { id: "marin", label: "Marin (natural, warm)" },
  { id: "cedar", label: "Cedar (natural, deep)" },
  { id: "coral", label: "Coral (bright)" },
  { id: "shimmer", label: "Shimmer (soft)" },
  { id: "sage", label: "Sage (calm)" },
  { id: "alloy", label: "Alloy (neutral)" },
  { id: "ash", label: "Ash (clear)" },
  { id: "echo", label: "Echo (deep)" },
  { id: "verse", label: "Verse (expressive)" },
];

const ENGINES = [
  { id: "realtime", label: "Realtime — most natural", hint: "Talks like a person: knows when you've finished, you can interrupt by speaking." },
  { id: "classic", label: "Standard", hint: "Record → answer → speak. Cheaper; works where Realtime is unavailable." },
];

const STATUS = {
  idle: "Tap the orb to start talking",
  listening: "Listening…",
  hearing: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking — tap to interrupt",
  muted: "Microphone muted",
  connecting: "Connecting…",
  error: "Something went wrong",
};

// Voice activity detection
const SILENCE_MS = 1600; // pause that ends a sentence
const MIN_SPEECH_MS = 250;
const MAX_UTTERANCE_MS = 60_000;
const IDLE_RESTART_MS = 20_000; // restart the recorder if nobody speaks, keeps files small

const PREFS_KEY = "atlas.voice.prefs";
const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

function rmsOf(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

async function apiError(res) {
  const data = await res.json().catch(() => ({}));
  return new Error(data?.error?.message || `Request failed (${res.status}).`);
}

export default function VoiceAgent() {
  const router = useRouter();
  const [phase, setPhase] = useState("idle"); // idle | listening | hearing | thinking | speaking | muted | error
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]); // { role, content, agentPrompt? }
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState("");
  const [voice, setVoice] = useState("marin");
  const [engine, setEngine] = useState("realtime");
  const [running, setRunning] = useState(null); // engine of the live conversation
  const [notice, setNotice] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");

  // Audio graph and loop state live in refs (they change every frame).
  const r = useRef({
    stream: null,
    ctx: null,
    micAnalyser: null,
    outAnalyser: null,
    audioEl: null,
    recorder: null,
    chunks: [],
    vadTimer: 0,
    abort: null,
    active: false,
    muted: false,
    phase: "idle",
    messages: [],
    language: "",
    voice: "marin",
    engine: "realtime",
    buf: null,
    rt: null, // live Realtime connection
    rtModel: "",
    rtResponding: false,
    rtNeedsResponse: false,
    rtTools: 0, // tool lookups in flight
    lastUserText: "",
  });
  const transcriptEnd = useRef(null);

  const setP = useCallback((p) => {
    r.current.phase = p;
    setPhase(p);
  }, []);

  // ---------- preferences ----------
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      queueMicrotask(() => {
        if (typeof saved.language === "string") setLanguage(saved.language);
        if (typeof saved.voice === "string" && VOICES.some((v) => v.id === saved.voice)) setVoice(saved.voice);
        if (ENGINES.some((e) => e.id === saved.engine)) setEngine(saved.engine);
      });
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    r.current.language = language;
    r.current.voice = voice;
    r.current.engine = engine;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ language, voice, engine }));
    } catch {
      /* storage unavailable */
    }
  }, [language, voice, engine]);
  useEffect(() => {
    r.current.messages = messages;
    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  // ---------- level for the orb ----------
  const getLevel = useCallback(() => {
    const s = r.current;
    const an = s.phase === "speaking" ? (s.rt ? s.rt.getAnalyser() : s.outAnalyser) : s.phase === "listening" || s.phase === "hearing" ? s.micAnalyser : null;
    if (!an) return 0;
    if (!s.buf || s.buf.length !== an.fftSize) s.buf = new Float32Array(an.fftSize);
    return Math.min(1, rmsOf(an, s.buf) * 6);
  }, []);

  // ---------- audio setup ----------
  const ensureAudio = useCallback(async () => {
    const s = r.current;
    if (!s.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      s.ctx = new Ctx();
    }
    if (s.ctx.state === "suspended") await s.ctx.resume();
    if (!s.audioEl) {
      s.audioEl = new Audio();
      s.audioEl.crossOrigin = "anonymous";
      const src = s.ctx.createMediaElementSource(s.audioEl);
      s.outAnalyser = s.ctx.createAnalyser();
      s.outAnalyser.fftSize = 1024;
      src.connect(s.outAnalyser);
      s.outAnalyser.connect(s.ctx.destination);
    }
    if (!s.stream) {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the microphone. Try Chrome, Edge or Safari.");
      s.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mic = s.ctx.createMediaStreamSource(s.stream);
      s.micAnalyser = s.ctx.createAnalyser();
      s.micAnalyser.fftSize = 1024;
      mic.connect(s.micAnalyser);
    }
  }, []);

  const stopRecorder = useCallback(() => {
    const s = r.current;
    clearInterval(s.vadTimer);
    s.vadTimer = 0;
    if (s.recorder && s.recorder.state !== "inactive") {
      s.recorder.onstop = null;
      s.recorder.stop();
    }
    s.recorder = null;
    s.chunks = [];
  }, []);

  const stopPlayback = useCallback(() => {
    const el = r.current.audioEl;
    if (el) {
      el.onended = null;
      el.pause();
      if (el.src) URL.revokeObjectURL(el.src);
      el.removeAttribute("src");
    }
  }, []);

  // ---------- conversation loop ----------
  const listenRef = useRef(() => {});

  const speak = useCallback(
    async (text, signal) => {
      const s = r.current;
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: s.voice }),
        signal,
      });
      if (!res.ok) throw await apiError(res);
      const blob = await res.blob();
      if (signal.aborted || !s.active) return;
      stopPlayback();
      s.audioEl.src = URL.createObjectURL(blob);
      setP("speaking");
      await new Promise((resolve) => {
        s.audioEl.onended = resolve;
        s.audioEl.onerror = resolve;
        signal.addEventListener("abort", resolve, { once: true });
        s.audioEl.play().catch(resolve);
      });
      stopPlayback();
    },
    [setP, stopPlayback],
  );

  const respond = useCallback(
    async (userText) => {
      const s = r.current;
      const controller = new AbortController();
      s.abort = controller;
      const history = s.messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((m) => [...m, { role: "user", content: userText }]);
      setP("thinking");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText,
            history,
            projects: loadSelectedConnectors(),
            mode: "auto",
            voice: { language: s.language || undefined },
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw await apiError(res);
        const data = await res.json();
        let reply;
        let agentPrompt;
        if (data.route === "agent") {
          agentPrompt = userText;
          reply = isDevanagari(userText) || s.language === "hi"
            ? "यह काम एक एजेंट से ऑटोमेट हो सकता है। नीचे 'Create agent' दबाइए, मैं उसे आपके लिए तैयार कर दूँगी।"
            : "This sounds like work to automate. Tap 'Create agent' below and I'll set up an agent for it.";
        } else {
          reply = String(data.answer || "").trim() || "Sorry, I couldn't find an answer to that.";
        }
        setMessages((m) => [...m, { role: "assistant", content: reply, agentPrompt }]);
        if (!s.active) return;
        await speak(reply, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || "Something went wrong.");
        setMessages((m) => [...m, { role: "assistant", content: err.message || "Something went wrong.", error: true }]);
      } finally {
        if (s.abort === controller) s.abort = null;
      }
      if (s.active && !controller.signal.aborted) listenRef.current();
    },
    [setP, speak],
  );

  const transcribe = useCallback(
    async (blob) => {
      const s = r.current;
      setP("thinking");
      const controller = new AbortController();
      s.abort = controller;
      try {
        const form = new FormData();
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("audio", blob, `speech.${ext}`);
        if (s.language) form.append("language", s.language);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form, signal: controller.signal });
        if (!res.ok) throw await apiError(res);
        const { text } = await res.json();
        if (s.abort === controller) s.abort = null;
        if (!s.active) return;
        if (!text || text.replace(/[\s.,!?।]/g, "").length < 2) {
          listenRef.current(); // nothing meaningful was said
          return;
        }
        setError("");
        await respond(text);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || "Could not understand the audio.");
        if (s.active) listenRef.current();
      }
    },
    [respond, setP],
  );

  const listen = useCallback(() => {
    const s = r.current;
    stopRecorder();
    if (!s.active) return;
    if (s.muted) {
      setP("muted");
      return;
    }
    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(s.stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError("Recording is not supported in this browser.");
      setP("error");
      return;
    }
    s.recorder = recorder;
    s.chunks = [];
    recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
    recorder.start(250);
    setP("listening");

    const buf = new Float32Array(s.micAnalyser.fftSize);
    const started = performance.now();
    let noise = 0.01;
    let speechMs = 0;
    let speaking = false;
    let lastVoice = 0;
    let speechStart = 0;
    let prev = performance.now();

    s.vadTimer = setInterval(() => {
      const now = performance.now();
      const dt = now - prev;
      prev = now;
      const level = rmsOf(s.micAnalyser, buf);
      const threshold = Math.max(0.018, noise * 2.8);
      if (level > threshold) {
        speechMs += dt;
        lastVoice = now;
        if (!speaking && speechMs >= MIN_SPEECH_MS) {
          speaking = true;
          speechStart = now;
          setP("hearing");
        }
      } else {
        speechMs = Math.max(0, speechMs - dt * 0.5);
        if (!speaking) noise = noise * 0.95 + level * 0.05; // adapt to the room
      }

      const done = speaking && (now - lastVoice > SILENCE_MS || now - speechStart > MAX_UTTERANCE_MS);
      if (done) {
        clearInterval(s.vadTimer);
        s.vadTimer = 0;
        recorder.onstop = () => {
          const blob = new Blob(s.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          s.chunks = [];
          s.recorder = null;
          transcribe(blob);
        };
        recorder.stop();
      } else if (!speaking && now - started > IDLE_RESTART_MS) {
        listenRef.current(); // fresh recorder, drops the silent audio
      }
    }, 50);
  }, [setP, stopRecorder, transcribe]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  // ---------- realtime engine ----------
  /** Insert or update a transcript line by the Realtime item id. */
  const upsert = useCallback((id, patch) => {
    setMessages((ms) => {
      const i = ms.findIndex((m) => m.id === id);
      if (i === -1) return [...ms, { id, content: "", ...patch }];
      const next = ms.slice();
      next[i] = { ...next[i], ...(typeof patch === "function" ? patch(next[i]) : patch) };
      return next;
    });
  }, []);

  const runTool = useCallback(
    async ({ call_id: callId, name, arguments: args }) => {
      const s = r.current;
      if (name === "build_agent") setAgentPrompt(s.lastUserText || "");
      s.rtTools += 1;
      setP("thinking");
      let output;
      try {
        const res = await fetch("/api/voice/realtime/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, arguments: args, projects: loadSelectedConnectors() }),
        });
        output = res.ok ? (await res.json()).output : JSON.stringify({ ok: false, error: (await apiError(res)).message });
      } catch (err) {
        output = JSON.stringify({ ok: false, error: err.message || "Lookup failed" });
      }
      s.rtTools = Math.max(0, s.rtTools - 1);
      if (!s.rt) return;
      s.rt.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
      if (s.rtResponding) s.rtNeedsResponse = true;
      else s.rt.send({ type: "response.create" });
    },
    [setP],
  );

  const onRealtimeEvent = useCallback(
    (ev) => {
      const s = r.current;
      switch (ev.type) {
        case "conversation.item.added":
        case "conversation.item.created": {
          const it = ev.item || {};
          if (it.type !== "message") break;
          if (it.role === "user") {
            const typed = (it.content || []).find((c) => c.type === "input_text")?.text;
            upsert(it.id, { role: "user", content: typed || "…", pending: !typed });
            if (typed) s.lastUserText = typed;
          } else if (it.role === "assistant") {
            upsert(it.id, (m) => ({ role: "assistant", content: m?.content || "" }));
          }
          break;
        }
        case "conversation.item.input_audio_transcription.delta":
          upsert(ev.item_id, (m) => ({ role: "user", content: (m?.pending ? "" : m?.content || "") + (ev.delta || ""), pending: false }));
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const text = String(ev.transcript || "").trim();
          if (text) {
            s.lastUserText = text;
            upsert(ev.item_id, { role: "user", content: text, pending: false });
          } else {
            setMessages((ms) => ms.filter((m) => m.id !== ev.item_id));
          }
          break;
        }
        case "conversation.item.input_audio_transcription.failed":
          setMessages((ms) => ms.filter((m) => m.id !== ev.item_id));
          break;
        case "input_audio_buffer.speech_started":
          if (!s.muted) setP("hearing");
          break;
        case "input_audio_buffer.speech_stopped":
          setP("thinking");
          break;
        case "response.created":
          s.rtResponding = true;
          if (s.phase !== "speaking") setP("thinking");
          break;
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
          upsert(ev.item_id, (m) => ({ role: "assistant", content: (m?.content || "") + (ev.delta || "") }));
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          if (ev.transcript) upsert(ev.item_id, { role: "assistant", content: ev.transcript });
          break;
        case "output_audio_buffer.started":
          setP("speaking");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          if (s.phase === "speaking") setP(s.muted ? "muted" : "listening");
          break;
        case "response.function_call_arguments.done":
          runTool(ev);
          break;
        case "response.done": {
          s.rtResponding = false;
          const u = ev.response?.usage;
          if (u) {
            fetch("/api/voice/realtime/usage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: s.rtModel, inputTokens: u.input_tokens, outputTokens: u.output_tokens }),
            }).catch(() => {});
          }
          if (ev.response?.status === "failed") {
            const msg = ev.response?.status_details?.error?.message;
            if (msg) setError(msg);
          }
          if (s.rtNeedsResponse) {
            s.rtNeedsResponse = false;
            s.rt?.send({ type: "response.create" });
          } else if (s.phase === "thinking" && !s.rtTools) {
            setP(s.muted ? "muted" : "listening");
          }
          break;
        }
        case "error": {
          const code = ev.error?.code || "";
          if (/response_cancel_not_active|conversation_already_has_active_response/.test(code)) break;
          console.warn("[voice] realtime error:", ev.error);
          if (ev.error?.message) setError(ev.error.message);
          break;
        }
        default:
          break;
      }
    },
    [runTool, setP, upsert],
  );

  const startRealtime = useCallback(async () => {
    const s = r.current;
    const res = await fetch("/api/voice/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: loadSelectedConnectors(), language: s.language || undefined, voice: s.voice }),
    });
    if (!res.ok) throw await apiError(res);
    const { clientSecret, callsUrl, model } = await res.json();
    s.rtModel = model;
    s.rtResponding = false;
    s.rtNeedsResponse = false;
    s.rtTools = 0;
    s.rt = await connectRealtime({
      clientSecret,
      callsUrl,
      micStream: s.stream,
      audioCtx: s.ctx,
      onEvent: onRealtimeEvent,
      onState: (state) => {
        if ((state === "failed" || state === "disconnected") && r.current.rt) {
          setError("Connection lost. Tap the orb to reconnect.");
          endRef.current();
        }
      },
    });
  }, [onRealtimeEvent]);

  const endRef = useRef(() => {});

  // ---------- controls ----------
  const start = useCallback(async () => {
    const s = r.current;
    if (s.active || s.phase === "connecting") return;
    setError("");
    setNotice("");
    setAgentPrompt("");
    try {
      await ensureAudio();
      s.stream.getAudioTracks().forEach((t) => (t.enabled = !s.muted));
      if (s.engine === "realtime" && typeof RTCPeerConnection !== "undefined") {
        setP("connecting");
        try {
          await startRealtime();
          s.active = true;
          setActive(true);
          setRunning("realtime");
          setP(s.muted ? "muted" : "listening");
          return;
        } catch (err) {
          console.warn("[voice] realtime unavailable, using standard mode:", err?.message);
          setNotice("Realtime voice is not available right now — using standard mode.");
        }
      }
      s.active = true;
      setActive(true);
      setRunning("classic");
      listen();
    } catch (err) {
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      setError(
        denied
          ? "Microphone permission was blocked. Allow the microphone for this site in your browser, then try again."
          : err?.message || "Could not start the microphone.",
      );
      setP("error");
    }
  }, [ensureAudio, listen, setP, startRealtime]);

  const end = useCallback(() => {
    const s = r.current;
    s.active = false;
    setActive(false);
    setRunning(null);
    s.rt?.close();
    s.rt = null;
    s.abort?.abort();
    s.abort = null;
    stopRecorder();
    stopPlayback();
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stream = null;
    s.micAnalyser = null;
    setP("idle");
  }, [setP, stopPlayback, stopRecorder]);

  useEffect(() => {
    endRef.current = end;
  }, [end]);

  /** Stop the assistant talking (or thinking) and listen right away. */
  const interrupt = useCallback(() => {
    const s = r.current;
    if (s.rt) {
      s.rt.send({ type: "response.cancel" });
      s.rt.send({ type: "output_audio_buffer.clear" });
      s.rtNeedsResponse = false;
      setP(s.muted ? "muted" : "listening");
      return;
    }
    s.abort?.abort();
    s.abort = null;
    stopPlayback();
    if (s.active) listen();
  }, [listen, setP, stopPlayback]);

  const toggleMute = useCallback(() => {
    const s = r.current;
    s.muted = !s.muted;
    setMuted(s.muted);
    s.stream?.getAudioTracks().forEach((t) => (t.enabled = !s.muted));
    if (s.rt) {
      if (s.muted && (s.phase === "listening" || s.phase === "hearing")) setP("muted");
      else if (!s.muted && s.phase === "muted") setP("listening");
      return;
    }
    if (s.phase === "listening" || s.phase === "hearing" || s.phase === "muted") listen();
  }, [listen, setP]);

  const onOrb = useCallback(() => {
    const p = r.current.phase;
    if (!r.current.active) start();
    else if (p === "speaking" || p === "thinking") interrupt();
    else if (p === "muted") toggleMute();
  }, [interrupt, start, toggleMute]);

  const sendTyped = useCallback(
    async (e) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setDraft("");
      const s = r.current;
      if (s.rt) {
        if (s.rtResponding) {
          s.rt.send({ type: "response.cancel" });
          s.rt.send({ type: "output_audio_buffer.clear" });
        }
        s.lastUserText = text;
        s.rt.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        s.rt.send({ type: "response.create" });
        return;
      }
      s.abort?.abort();
      stopRecorder();
      stopPlayback();
      if (!s.active) {
        try {
          await ensureAudio();
          s.active = true;
          setActive(true);
        } catch {
          // No microphone: still answer, speaking needs no mic.
          if (!s.ctx) return setError("Audio is not available in this browser.");
          s.active = true;
          setActive(true);
        }
      }
      respond(text);
    },
    [draft, ensureAudio, respond, stopPlayback, stopRecorder],
  );

  // Space bar = tap the orb; Escape = close.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        onOrb();
      } else if (e.key === "Escape") {
        if (showTranscript || showSettings) {
          setShowTranscript(false);
          setShowSettings(false);
        } else if (r.current.active) end();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end, onOrb, showSettings, showTranscript]);

  // Clean up on leave.
  useEffect(
    () => () => {
      const s = r.current;
      s.active = false;
      s.abort?.abort();
      clearInterval(s.vadTimer);
      if (s.recorder && s.recorder.state !== "inactive") s.recorder.stop();
      s.rt?.close();
      s.audioEl?.pause();
      s.stream?.getTracks().forEach((t) => t.stop());
      s.ctx?.close().catch(() => {});
    },
    [],
  );

  const close = () => {
    end();
    router.push("/");
  };

  const shown = messages.filter((m) => m.content && !m.pending);
  const lastUser = [...shown].reverse().find((m) => m.role === "user");
  const lastAssistant = shown.length && shown[shown.length - 1].role === "assistant" ? shown[shown.length - 1] : null;
  const buildPrompt = agentPrompt || lastAssistant?.agentPrompt || "";
  const orbState = phase === "hearing" ? "listening" : phase === "muted" ? "idle" : phase === "connecting" ? "thinking" : phase;
  const statusText =
    error && (phase === "error" || !active)
      ? error
      : phase === "speaking" && running === "realtime"
        ? "Speaking — just talk to interrupt"
        : STATUS[phase];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#030816] text-white">
      {/* backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.10),transparent_55%),radial-gradient(ellipse_at_top,rgba(30,41,59,0.9),transparent_60%)]"
      />

      {/* top bar */}
      <header className="relative z-10 flex items-center gap-2 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30">
            <Icon name="mic" className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Agent A</p>
            <p className="text-[11px] text-white/50">{LANGUAGES.find((l) => l.code === language)?.label}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Transcript" icon="chat" onClick={() => setShowTranscript((v) => !v)} active={showTranscript} />
          <IconButton label="Voice settings" icon="settings" onClick={() => setShowSettings((v) => !v)} active={showSettings} />
          <IconButton label="Close voice mode" icon="close" onClick={close} />
        </div>
      </header>

      {/* orb + captions */}
      <main className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <button
          type="button"
          onClick={onOrb}
          aria-label={active ? (phase === "speaking" ? "Interrupt" : "Voice assistant") : "Start talking"}
          className="relative aspect-square w-[min(88vw,58vh,560px)] cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
        >
          <ParticleOrb state={orbState} getLevel={getLevel} className="pointer-events-none absolute inset-[-12%] size-[124%]" />
        </button>

        <div className="mt-2 flex min-h-[7.5rem] w-full max-w-2xl flex-col items-center text-center" aria-live="polite">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              phase === "error" || (error && !active) ? "text-red-300" : "text-brand-300",
            )}
          >
            {(phase === "listening" || phase === "hearing") && <span className="size-2 animate-pulse rounded-full bg-brand-400" />}
            {(phase === "thinking" || phase === "connecting") && <Dots />}
            {statusText}
          </p>
          {lastUser && active && phase === "thinking" && (
            <p className="mt-3 line-clamp-2 max-w-xl text-[15px] text-white/55">“{lastUser.content}”</p>
          )}
          {lastAssistant && phase !== "thinking" && phase !== "hearing" && (
            <p className={cn("mt-3 line-clamp-4 max-w-xl text-base leading-relaxed", lastAssistant.error ? "text-red-200" : "text-white/85")}>
              {lastAssistant.content}
            </p>
          )}
          {notice && <p className="mt-2 text-xs text-amber-200/80">{notice}</p>}
          {buildPrompt && (
            <Link
              href={`/agents/new?prompt=${encodeURIComponent(buildPrompt)}`}
              onClick={end}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-navy-800 hover:bg-brand-400"
            >
              <Icon name="bot" className="size-4" /> Create agent
            </Link>
          )}
          {!active && !messages.length && (
            <p className="mt-3 max-w-md text-sm text-white/45">
              Ask anything in Hindi, English or your own language — “Aaj kitni admissions pending hain?”, “How do I create an agent?”
            </p>
          )}
        </div>
      </main>

      {/* typed input */}
      {typing && (
        <form onSubmit={sendTyped} className="relative z-10 mx-auto mb-3 flex w-full max-w-xl gap-2 px-4">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message — the answer will be spoken"
            maxLength={4000}
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-brand-400/70"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-500 text-navy-800 disabled:opacity-40"
            aria-label="Send"
          >
            <Icon name="arrowUp" className="size-5" />
          </button>
        </form>
      )}

      {/* bottom controls */}
      <footer className="relative z-10 flex items-center justify-center gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <RoundButton label={typing ? "Hide keyboard" : "Type instead"} onClick={() => setTyping((v) => !v)} active={typing}>
          <Icon name="keyboard" className="size-6" />
        </RoundButton>

        {active ? (
          <RoundButton label={muted ? "Unmute microphone" : "Mute microphone"} onClick={toggleMute} active={muted} big>
            <Icon name={muted ? "micOff" : "mic"} className="size-7" />
          </RoundButton>
        ) : (
          <button
            type="button"
            onClick={start}
            className="flex h-16 items-center gap-2 rounded-full bg-brand-500 px-7 text-base font-semibold text-navy-800 shadow-[0_0_40px_rgba(16,185,129,0.45)] transition hover:bg-brand-400"
          >
            <Icon name="mic" className="size-6" /> Start talking
          </button>
        )}

        <RoundButton label={active ? "End conversation" : "Close"} onClick={active ? end : close} danger={active}>
          <Icon name="close" className="size-6" />
        </RoundButton>
      </footer>

      {/* settings sheet */}
      {showSettings && (
        <Sheet title="Voice settings" onClose={() => setShowSettings(false)}>
          <p className="block text-xs font-semibold uppercase tracking-wider text-white/50">Voice engine</p>
          <div className="mt-1.5 space-y-2">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEngine(e.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  engine === e.id ? "border-brand-400 bg-brand-500/15" : "border-white/10 hover:border-white/25",
                )}
              >
                <span className="block text-sm text-white">{e.label}</span>
                <span className="block text-xs text-white/50">{e.hint}</span>
              </button>
            ))}
          </div>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/50">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b1426] px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-white/45">Auto understands and replies in whatever language you speak, including Hinglish.</p>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/50">Assistant voice</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {VOICES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVoice(v.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition",
                  voice === v.id ? "border-brand-400 bg-brand-500/15 text-white" : "border-white/10 text-white/70 hover:border-white/25",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          {active && (
            <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Changes apply the next time you start talking (end and start again).
            </p>
          )}
          <p className="mt-4 text-xs text-white/45">
            Tip: press <kbd className="rounded bg-white/10 px-1">Space</kbd> to start or interrupt, <kbd className="rounded bg-white/10 px-1">Esc</kbd> to end.
            Data questions use the connectors selected on Home.
          </p>
        </Sheet>
      )}

      {/* transcript sheet */}
      {showTranscript && (
        <Sheet title="Transcript" onClose={() => setShowTranscript(false)} wide>
          {shown.length === 0 ? (
            <p className="text-sm text-white/50">Your conversation will appear here.</p>
          ) : (
            <div className="space-y-3">
              {shown.map((m, i) => (
                <div key={m.id || i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                      m.role === "user" ? "rounded-br-md bg-brand-500 text-navy-800" : "rounded-bl-md bg-white/8 text-white/90",
                      m.error && "bg-red-500/15 text-red-200",
                    )}
                  >
                    {m.content}
                  </p>
                </div>
              ))}
              <div ref={transcriptEnd} />
            </div>
          )}
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="mt-4 text-xs font-medium text-white/50 hover:text-white">
              Clear conversation
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}

function IconButton({ label, icon, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("rounded-full p-2.5 transition", active ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white")}
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}

function RoundButton({ label, onClick, children, active, danger, big }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid place-items-center rounded-full transition",
        big ? "size-16" : "size-14",
        danger
          ? "bg-red-500/90 text-white hover:bg-red-500"
          : active
            ? "bg-white text-navy-800"
            : "bg-white/10 text-white ring-1 ring-white/10 hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children, wide }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[75vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0b1426]/95 p-5 shadow-2xl backdrop-blur sm:rounded-2xl",
          wide ? "sm:max-w-xl" : "sm:max-w-sm",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
