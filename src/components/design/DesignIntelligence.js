"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import ParticleOrb from "@/components/voice/ParticleOrb";
import "./designintelligence.css";

// Class names from designintelligence.css (prefixed di- so they never clash with the app).
const s = Object.fromEntries(
  ["root", "aurora", "blob1", "blob2", "blob3", "blob", "grid", "glass", "spot", "ring", "gradientText", "caret", "reveal", "feedIn", "pulseDot", "draw", "bar", "shimmerBar", "marqueeWrap", "marquee", "float", "navActive", "button"].map((c) => [c, `di-${c.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`]),
);

/**
 * Design Intelligence — a single preview page for a new IntelligenceOS look:
 * glassmorphism panels, aurora background, cursor spotlights, animated numbers,
 * live activity feed and the Agent A orb. Uses sample data only; nothing here is
 * wired to the real app yet. If approved, the pieces move into the shared UI.
 */

const NAV = [
  { label: "Home", icon: "home", active: true },
  { label: "Voice · Agent A", icon: "mic" },
  { label: "My Agents", icon: "bot" },
  { label: "Execution History", icon: "history" },
  { label: "Execution Logs", icon: "terminal" },
  { label: "Connectors", icon: "plug" },
  { label: "API Usage", icon: "chart" },
];

const PROMPTS = [
  "Aaj kitni admissions pending hain?",
  "Every morning, email me yesterday's lead report",
  "Summarise this week's fee collections by programme",
  "Remind faculty about attendance every Friday 4 PM",
];

const STATS = [
  { label: "Active agents", value: 24, suffix: "", delta: "+3 this week", icon: "bot", points: [8, 10, 9, 13, 12, 16, 18, 21, 24] },
  { label: "Runs today", value: 1284, suffix: "", delta: "+18%", icon: "play", points: [30, 42, 38, 55, 61, 58, 72, 80, 96] },
  { label: "Success rate", value: 99.2, suffix: "%", delta: "+0.4 pts", icon: "check", decimals: 1, points: [96, 97, 96.5, 98, 98.4, 98.1, 98.9, 99, 99.2] },
  { label: "Hours saved", value: 312, suffix: "h", delta: "this month", icon: "clock", points: [20, 45, 70, 110, 140, 190, 230, 275, 312] },
];

const AGENTS = [
  { name: "Admissions Daily Digest", desc: "Pending applications summary to the admissions team", status: "running", progress: 72, next: "Running now", tools: ["CRM", "Email"] },
  { name: "Lead Follow-up Nudger", desc: "Finds cold leads and drafts follow-ups for counsellors", status: "active", progress: 100, next: "Next run 6:00 PM", tools: ["CRM", "WhatsApp"] },
  { name: "Fee Reminder Bot", desc: "Reminds students with dues 3 days before the deadline", status: "active", progress: 100, next: "Tomorrow 9:00 AM", tools: ["ERP", "SMS"] },
  { name: "Attendance Watch", desc: "Flags students below 75% attendance to mentors", status: "paused", progress: 40, next: "Paused", tools: ["LMS"] },
];

const EVENTS = [
  { icon: "check", tone: "ok", text: "Admissions Daily Digest sent to 6 people" },
  { icon: "plug", tone: "info", text: "CRM connector synced 1,920 records" },
  { icon: "bot", tone: "ok", text: "Lead Follow-up Nudger drafted 14 messages" },
  { icon: "mic", tone: "info", text: "Agent A answered a question in Hindi" },
  { icon: "shield", tone: "warn", text: "Fee Reminder Bot is waiting for approval" },
  { icon: "chart", tone: "info", text: "Usage report for November is ready" },
  { icon: "check", tone: "ok", text: "Attendance Watch checked 3 programmes" },
];

const CONNECTORS = ["ATLAS CRM", "Admissions ERP", "Gmail", "Google Sheets", "WhatsApp", "LMS", "Fee Portal", "HRMS", "Slack", "Google Calendar"];

// ---------- hooks ----------

function useCountUp(target, { duration = 1800, decimals = 0, delay = 0 } = {}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const eased = 1 - Math.pow(1 - p, 4);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function useTypewriter(lines) {
  const [text, setText] = useState("");
  useEffect(() => {
    let i = 0;
    let j = 0;
    let deleting = false;
    let timer = 0;
    const step = () => {
      const line = lines[i];
      j += deleting ? -1 : 1;
      setText(line.slice(0, j));
      let wait = deleting ? 22 : 45;
      if (!deleting && j === line.length) {
        deleting = true;
        wait = 1800;
      } else if (deleting && j === 0) {
        deleting = false;
        i = (i + 1) % lines.length;
        wait = 350;
      }
      timer = setTimeout(step, wait);
    };
    timer = setTimeout(step, 900);
    return () => clearTimeout(timer);
  }, [lines]);
  return text;
}

/** Mouse position → CSS vars for the spotlight. */
function spotlight(e) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
}

// Gentle breathing for the orb (no microphone on this page).
const breathe = () => {
  const t = performance.now() / 1000;
  return 0.12 + 0.1 * Math.sin(t * 1.6) * Math.sin(t * 0.7) ** 2;
};

const delay = (ms) => ({ animationDelay: `${ms}ms` });

// ---------- pieces ----------

function Sparkline({ points, id }) {
  const w = 120;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 4 - ((p - min) / (max - min || 1)) * (h - 8)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-28" aria-hidden="true">
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={`url(#fill-${id})`} />
      <path d={d} fill="none" stroke={`url(#line-${id})`} strokeWidth="2" strokeLinecap="round" className={s.draw} />
    </svg>
  );
}

function StatCard({ stat, index }) {
  const value = useCountUp(stat.value, { decimals: stat.decimals || 0, delay: 300 + index * 120 });
  return (
    <div onMouseMove={spotlight} className={cn(s.glass, s.spot, s.reveal, "rounded-2xl p-5")} style={delay(250 + index * 90)}>
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
          <Icon name={stat.icon} className="size-[18px]" />
        </span>
        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">{stat.delta}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-white tabular-nums">
            {value}
            <span className="text-lg text-white/60">{stat.suffix}</span>
          </p>
          <p className="mt-1 text-xs text-white/50">{stat.label}</p>
        </div>
        <Sparkline points={stat.points} id={index} />
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  running: { dot: "text-cyan-300", label: "Running", chip: "bg-cyan-400/10 text-cyan-200 ring-cyan-400/25" },
  active: { dot: "text-emerald-400", label: "Active", chip: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/25" },
  paused: { dot: "text-amber-300", label: "Paused", chip: "bg-amber-400/10 text-amber-200 ring-amber-400/25" },
};

function AgentCard({ agent, index }) {
  const st = STATUS_STYLE[agent.status];
  return (
    <div onMouseMove={spotlight} className={cn(s.glass, s.spot, s.reveal, "group rounded-2xl p-5")} style={delay(500 + index * 100)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-cyan-400/10 text-emerald-200 ring-1 ring-white/10 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
          <Icon name="bot" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
            <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", st.chip)}>
              <span className={cn("size-1.5 rounded-full bg-current", st.dot, agent.status !== "paused" && s.pulseDot)} />
              {st.label}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">{agent.desc}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn(s.bar, "relative h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400")}
          style={{ width: `${agent.progress}%`, ...delay(700 + index * 120) }}
        >
          {agent.status === "running" && <span className={cn(s.shimmerBar, "absolute inset-0")} />}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/45">
        <Icon name="clock" className="size-3.5" />
        <span>{agent.next}</span>
        <span className="ml-auto flex gap-1">
          {agent.tools.map((t) => (
            <span key={t} className="rounded-md bg-white/5 px-1.5 py-0.5 text-white/60 ring-1 ring-white/10">
              {t}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

const TONE = {
  ok: "bg-emerald-400/15 text-emerald-300",
  info: "bg-cyan-400/15 text-cyan-300",
  warn: "bg-amber-400/15 text-amber-300",
};

function LiveFeed() {
  const [items, setItems] = useState(() => EVENTS.slice(0, 4).map((e, i) => ({ ...e, id: i, ago: `${(i + 1) * 3} min ago` })));
  const next = useRef(4);
  useEffect(() => {
    const t = setInterval(() => {
      const e = EVENTS[next.current % EVENTS.length];
      const id = next.current++;
      setItems((list) => [{ ...e, id, ago: "just now", fresh: true }, ...list.map((x) => ({ ...x, fresh: false }))].slice(0, 5));
    }, 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className={cn("flex items-center gap-3 overflow-hidden rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5", e.fresh && s.feedIn)}>
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[e.tone])}>
            <Icon name={e.icon} className="size-4" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">{e.text}</p>
          <span className="shrink-0 text-[11px] text-white/35">{e.ago}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- page ----------

export default function DesignIntelligence() {
  const typed = useTypewriter(PROMPTS);
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    queueMicrotask(() => setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"));
  }, []);

  return (
    <div className={cn(s.root, "relative min-h-screen overflow-x-hidden")}>
      <div className={s.aurora} aria-hidden="true">
        <div className={cn(s.blob, s.blob1)} />
        <div className={cn(s.blob, s.blob2)} />
        <div className={cn(s.blob, s.blob3)} />
      </div>
      <div className={s.grid} aria-hidden="true" />

      <div className="flex min-h-screen gap-4 p-3 sm:p-4">
        {/* Sidebar */}
        <aside className={cn(s.glass, s.reveal, "sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-3xl p-4 lg:flex")} style={delay(0)}>
          <div className="flex items-center gap-2.5 px-1">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-[15px] font-black text-[#052e1f] shadow-[0_0_24px_rgba(16,185,129,0.6)]">
              A
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">ATLAS</p>
              <p className="text-[11px] text-white/45">IntelligenceOS</p>
            </div>
          </div>

          <button type="button" className={cn(s.button, "mt-5 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#052e1f]")}>
            <Icon name="plus" className="size-4" /> New agent
          </button>

          <nav className="mt-5 space-y-1">
            {NAV.map((n) => (
              <a
                key={n.label}
                href="#"
                onClick={(e) => e.preventDefault()}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors duration-300",
                  n.active ? cn(s.navActive, "font-semibold text-white") : "text-white/55 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon name={n.icon} className="size-[18px]" />
                {n.label}
              </a>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-gradient-to-br from-emerald-400/15 to-cyan-400/5 p-4 ring-1 ring-white/10">
            <p className="text-xs font-semibold text-white">Talk to Agent A</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">Hindi, English, Hinglish — just speak.</p>
            <Link href="/voice" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-white/15">
              <Icon name="mic" className="size-3.5" /> Open voice
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl px-1 pt-2">
            <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xs font-semibold">AE</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium text-white">ATLAS Employee</p>
              <p className="text-[11px] text-white/40">Admin</p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 space-y-4">
          {/* Top bar */}
          <header className={cn(s.glass, s.reveal, "flex items-center gap-3 rounded-2xl px-4 py-3")} style={delay(80)}>
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-black text-[#052e1f] lg:hidden">A</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-white/40 ring-1 ring-white/10 transition focus-within:ring-emerald-400/50 sm:max-w-md">
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input placeholder="Search agents, runs, connectors…" className="min-w-0 flex-1 bg-transparent text-white placeholder:text-white/40 outline-none" />
              <kbd className="hidden rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/50 sm:block">⌘K</kbd>
            </div>
            <span className="ml-auto hidden items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20 sm:inline-flex">
              <span className={cn("size-1.5 rounded-full bg-emerald-400 text-emerald-400", s.pulseDot)} />
              OpenAI connected
            </span>
          </header>

          {/* Hero */}
          <section className={cn(s.glass, s.ring, s.reveal, "overflow-hidden rounded-3xl")} style={delay(160)}>
            <div className="grid items-center gap-2 p-5 sm:p-8 md:grid-cols-[1.2fr_1fr]">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60 ring-1 ring-white/10">
                  <Icon name="sparkles" className="size-3.5 text-emerald-300" />
                  Design Intelligence · preview
                </p>
                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                  {greeting}. <br />
                  <span className={s.gradientText}>What should Agent A do today?</span>
                </h1>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/55">
                  Describe a task in plain words — Agent A plans it, connects the right systems and runs it for you, on schedule.
                </p>

                <div className="mt-6 flex items-center gap-2 rounded-2xl bg-black/20 p-2 pl-4 ring-1 ring-white/10 backdrop-blur transition focus-within:ring-emerald-400/50">
                  <p className="min-w-0 flex-1 truncate text-[15px] text-white/85">
                    {typed}
                    <span className={s.caret} />
                  </p>
                  <Link href="/voice" aria-label="Talk to Agent A" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">
                    <Icon name="mic" className="size-[18px]" />
                  </Link>
                  <button type="button" aria-label="Send" className={cn(s.button, "grid size-10 shrink-0 place-items-center rounded-xl text-[#052e1f]")}>
                    <Icon name="arrowUp" className="size-5" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Daily lead report", "Pending admissions", "Fee reminders", "Weekly summary"].map((c, i) => (
                    <span
                      key={c}
                      className={cn(s.reveal, "cursor-default rounded-full bg-white/5 px-3 py-1 text-xs text-white/60 ring-1 ring-white/10 transition hover:bg-emerald-400/10 hover:text-emerald-200 hover:ring-emerald-400/30")}
                      style={delay(700 + i * 80)}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className={cn(s.float, "relative mx-auto aspect-square w-full max-w-[260px] md:max-w-[360px]")}>
                <ParticleOrb state="listening" getLevel={breathe} className="pointer-events-none absolute inset-[-14%] size-[128%]" />
                <span className="absolute bottom-[6%] left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-white/10 backdrop-blur">
                  Agent A · listening
                </span>
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STATS.map((st, i) => (
              <StatCard key={st.label} stat={st} index={i} />
            ))}
          </section>

          {/* Agents + feed */}
          <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div>
              <div className={cn(s.reveal, "mb-3 flex items-center justify-between px-1")} style={delay(450)}>
                <h2 className="text-sm font-semibold text-white">Your agents</h2>
                <span className="text-xs text-white/40">4 of 24</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {AGENTS.map((a, i) => (
                  <AgentCard key={a.name} agent={a} index={i} />
                ))}
              </div>
            </div>
            <div className={cn(s.glass, s.reveal, "rounded-2xl p-5")} style={delay(600)}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Live activity</h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
                  <span className={cn("size-1.5 rounded-full bg-emerald-400 text-emerald-400", s.pulseDot)} />
                  Live
                </span>
              </div>
              <LiveFeed />
            </div>
          </section>

          {/* Connectors marquee */}
          <section className={cn(s.glass, s.reveal, "rounded-2xl py-4")} style={delay(750)}>
            <p className="mb-3 px-5 text-xs font-medium uppercase tracking-wider text-white/40">Connected systems</p>
            <div className={cn(s.marqueeWrap, "overflow-hidden")}>
              <div className={s.marquee}>
                {[...CONNECTORS, ...CONNECTORS].map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 ring-1 ring-white/10">
                    <Icon name="plug" className="size-4 text-emerald-300" />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <p className="pb-4 text-center text-[11px] text-white/30">Design preview with sample data · ATLAS IntelligenceOS</p>
        </main>
      </div>
    </div>
  );
}
