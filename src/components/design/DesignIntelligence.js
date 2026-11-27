"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import ParticleOrb from "@/components/voice/ParticleOrb";
import "./designintelligence.css";
import { SUPER_AGENT } from "@/lib/portals/portalAgents";

/**
 * Design Intelligence — preview of a calm, professional dark look for IntelligenceOS
 * (overview dashboard). Sample data only; nothing here is wired to the real app.
 * Motion is limited to what explains a change: range switches tween numbers and the
 * chart, new runs slide into the table, hover reveals detail.
 */

// ---------- sample data ----------

const RANGES = [
  { id: "24h", label: "24h", points: 24, label0: (i) => `${String(i).padStart(2, "0")}:00` },
  { id: "7d", label: "7 days", points: 7, label0: (i) => ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][i] },
  { id: "30d", label: "30 days", points: 30, label0: (i) => `${((i + 26) % 30) + 1} ${i < 4 ? "Oct" : "Nov"}` },
];

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

const SERIES = Object.fromEntries(
  RANGES.map((r, k) => {
    const rnd = seeded(7 + k * 31);
    const base = r.id === "24h" ? 40 : r.id === "7d" ? 1100 : 1050;
    const ok = [];
    const failed = [];
    for (let i = 0; i < r.points; i++) {
      const wave = r.id === "24h" ? Math.sin(((i - 6) / 24) * Math.PI * 2) * 0.55 + 0.6 : 0.85 + Math.sin(i / 2.2) * 0.12 + i * 0.006;
      const v = Math.max(4, Math.round(base * wave * (0.9 + rnd() * 0.2)));
      ok.push(v);
      failed.push(Math.round(v * (0.004 + rnd() * 0.012)));
    }
    return [r.id, { ok, failed }];
  }),
);

const KPIS = {
  "24h": { runs: 1284, success: 99.2, agents: 24, saved: 41, d: [18.2, 0.4, 3, 12.5] },
  "7d": { runs: 8231, success: 98.9, agents: 24, saved: 268, d: [9.6, 0.2, 3, 8.1] },
  "30d": { runs: 33910, success: 98.6, agents: 24, saved: 1104, d: [22.4, -0.3, 7, 19.7] },
};

const AGENTS = ["Admissions Daily Digest", "Lead Follow-up Nudger", "Fee Reminder", "Attendance Watch", "Placement Drive Sync", "Hostel Request Triage"];
const TRIGGERS = ["Schedule", "Manual", "Webhook", "Agent A"];
const STATUSES = ["succeeded", "succeeded", "succeeded", "succeeded", "running", "failed", "approval"];

const INITIAL_RUNS = [
  { id: 9, agent: "Admissions Daily Digest", trigger: "Schedule", status: "running", duration: "—", started: "just now" },
  { id: 8, agent: "Lead Follow-up Nudger", trigger: "Schedule", status: "succeeded", duration: "42s", started: "4 min ago" },
  { id: 7, agent: "Fee Reminder", trigger: "Webhook", status: "approval", duration: "18s", started: "11 min ago" },
  { id: 6, agent: "Placement Drive Sync", trigger: "Manual", status: "succeeded", duration: "1m 06s", started: "23 min ago" },
  { id: 5, agent: "Attendance Watch", trigger: "Schedule", status: "failed", duration: "9s", started: "38 min ago" },
  { id: 4, agent: "Hostel Request Triage", trigger: "Agent A", status: "succeeded", duration: "27s", started: "52 min ago" },
];

const TOP_AGENTS = [
  { name: "Lead Follow-up Nudger", runs: 412, owner: "Admissions" },
  { name: "Admissions Daily Digest", runs: 318, owner: "Admissions" },
  { name: "Fee Reminder", runs: 241, owner: "Accounts" },
  { name: "Placement Drive Sync", runs: 156, owner: "Career Services" },
  { name: "Attendance Watch", runs: 97, owner: "Academics" },
];

const NAV = [
  { section: null, items: [{ label: "Overview", icon: "home", active: true }, { label: "Agents", icon: "bot", count: 24 }, { label: "Runs", icon: "history" }, { label: "Logs", icon: "terminal" }, { label: "Connectors", icon: "plug", count: 9 }] },
  { section: "Super agent", items: [{ label: SUPER_AGENT.name, icon: "mic", href: "/voice", badge: "Voice" }] },
  { section: "Admin", items: [{ label: "API usage", icon: "chart" }, { label: "Models", icon: "cpu" }, { label: "Users", icon: "user" }] },
];

const STATUS = {
  succeeded: { label: "Succeeded", dot: "bg-emerald-400", text: "text-emerald-300" },
  running: { label: "Running", dot: "bg-sky-400", text: "text-sky-300" },
  failed: { label: "Failed", dot: "bg-rose-400", text: "text-rose-300" },
  approval: { label: "Needs approval", dot: "bg-amber-400", text: "text-amber-300" },
};

// ---------- helpers ----------

const fmt = (n, d = 0) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const anim = (ms) => ({ animationDelay: `${ms}ms` });
const ease = (p) => 1 - Math.pow(1 - p, 3);

/** Smoothly tweens a number (or array of numbers) to a new target. */
function useTween(target, duration = 600) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = ease(Math.min(1, (now - t0) / duration));
      const v = Array.isArray(target) ? target.map((t, i) => (start[i] ?? t) + (t - (start[i] ?? t)) * p) : start + (target - start) * p;
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Resample to n points so different ranges can morph into each other. */
function resample(arr, n) {
  if (arr.length === n) return arr;
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (arr.length - 1);
    const a = Math.floor(x);
    const b = Math.min(arr.length - 1, a + 1);
    return arr[a] + (arr[b] - arr[a]) * (x - a);
  });
}

function smoothPath(pts) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------- pieces ----------

function Sidebar() {
  return (
    <aside className="di-glass sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-y-0 border-l-0 lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <span className="grid size-7 place-items-center rounded-md bg-emerald-500 text-[13px] font-bold text-[#062b1f]">A</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">ATLAS SkillTech</p>
          <p className="text-[11px] text-[var(--faint)]">IntelligenceOS</p>
        </div>
        <svg viewBox="0 0 24 24" className="size-4 text-[var(--faint)]" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </div>

      <div className="px-3 pt-3">
        <button type="button" className="di-hover flex w-full items-center gap-2 rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-[13px] text-[var(--muted)]">
          <SearchIcon />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-white/10 px-1 font-mono text-[10px] text-[var(--faint)]">⌘K</kbd>
        </button>
      </div>

      <nav className="di-scroll flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((g) => (
          <div key={g.section || "main"} className={g.section ? "mt-5" : ""}>
            {g.section && <p className="px-2.5 pb-1 text-[11px] font-medium text-[var(--faint)]">{g.section}</p>}
            <ul className="space-y-px">
              {g.items.map((n) => {
                const cls = cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  n.active ? "bg-white/[0.07] font-medium text-white" : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-white",
                );
                const body = (
                  <>
                    <Icon name={n.icon} className={cn("size-4", n.active ? "text-emerald-400" : "")} />
                    <span className="flex-1">{n.label}</span>
                    {n.count != null && <span className="text-[11px] tabular-nums text-[var(--faint)]">{n.count}</span>}
                    {n.badge && <span className="rounded bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-300">{n.badge}</span>}
                  </>
                );
                return (
                  <li key={n.label}>
                    {n.href ? (
                      <Link href={n.href} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <a href="#" onClick={(e) => e.preventDefault()} className={cls}>
                        {body}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="rounded-lg border border-white/[0.06] p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[var(--muted)]">AI budget · Nov</span>
            <span className="tabular-nums">62%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="di-grow h-full w-[62%] rounded-full bg-emerald-500" style={anim(400)} />
          </div>
          <p className="mt-2 text-[11px] text-[var(--faint)]">$186 of $300 used</p>
        </div>
        <div className="mt-3 flex items-center gap-2.5 px-1">
          <span className="grid size-7 place-items-center rounded-full bg-slate-700 text-[11px] font-semibold">AE</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-medium">ATLAS Employee</p>
            <p className="text-[11px] text-[var(--faint)]">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function RangeTabs({ value, onChange }) {
  const idx = RANGES.findIndex((r) => r.id === value);
  return (
    <div role="tablist" aria-label="Time range" className="relative grid grid-cols-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5 text-[12px]">
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)]"
        style={{ transform: `translateX(${idx * 100}%)` }}
      />
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          aria-selected={r.id === value}
          onClick={() => onChange(r.id)}
          className={cn("relative px-3 py-1 font-medium transition-colors", r.id === value ? "text-white" : "text-[var(--muted)] hover:text-white")}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Spark({ data, up }) {
  const w = 72;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-[72px]" aria-hidden="true">
      <path d={smoothPath(pts)} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

function Kpi({ label, value, decimals = 0, suffix = "", delta, deltaSuffix = "%", spark, hint, i }) {
  const v = useTween(value);
  const dv = useTween(delta);
  const up = delta >= 0;
  return (
    <div className="di-in flex flex-col justify-between gap-3 bg-[#0c121e] p-4 sm:p-5" style={anim(80 + i * 50)}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--muted)]">{label}</p>
        <Spark data={spark} up={up} />
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">
          {fmt(v, decimals)}
          {suffix && <span className="ml-0.5 text-[15px] font-medium text-[var(--muted)]">{suffix}</span>}
        </p>
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums", up ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
          {up ? "+" : "−"}
          {fmt(Math.abs(dv), deltaSuffix === "" ? 0 : 1)}
          {deltaSuffix}
        </span>
      </div>
      <p className="text-[11px] text-[var(--faint)]">{hint}</p>
    </div>
  );
}

const N = 30; // chart points after resampling (lets ranges morph)

function RunsChart({ range }) {
  const r = RANGES.find((x) => x.id === range);
  const raw = SERIES[range];
  const target = useMemo(() => [...resample(raw.ok, N), ...resample(raw.failed, N)], [raw]);
  const vals = useTween(target, 700);
  const ok = vals.slice(0, N);
  const failed = vals.slice(N);
  const [boxRef, width] = useWidth();
  const [hover, setHover] = useState(null);

  const H = 220;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const W = Math.max(width, 300);
  const max = Math.max(...raw.ok) * 1.15;
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const x = (i) => padL + (i / (N - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);
  const okPts = ok.map((v, i) => [x(i), y(v)]);
  const failPts = failed.map((v, i) => [x(i), y(v * 8)]); // failures are tiny; shown on a ×8 scale (labelled)
  const line = smoothPath(okPts);
  const area = `${line} L${x(N - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);

  // Hover maps to the real (un-resampled) point of this range.
  const real = hover == null ? null : Math.round((hover / (N - 1)) * (r.points - 1));
  const hx = real == null ? 0 : x((real / (r.points - 1)) * (N - 1));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (N - 1));
    setHover(Math.max(0, Math.min(N - 1, i)));
  };

  const labelEvery = Math.ceil(r.points / 7);

  return (
    <div ref={boxRef} className="relative w-full select-none">
      <svg width={W} height={H} className="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Runs over time">
        <defs>
          <linearGradient id="di-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" strokeDasharray={t ? "3 4" : undefined} />
            <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5d6778" className="tabular-nums">
              {t >= 1000 ? `${fmt(t / 1000, t % 1000 ? 1 : 0)}k` : fmt(t)}
            </text>
          </g>
        ))}
        {Array.from({ length: r.points }, (_, i) =>
          i % labelEvery === 0 || i === r.points - 1 ? (
            <text key={i} x={x((i / (r.points - 1)) * (N - 1))} y={H - 6} textAnchor="middle" fontSize="11" fill="#5d6778">
              {r.label0(i)}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#di-area)" />
        <path d={line} fill="none" stroke="#10b981" strokeWidth="2" pathLength="1" className="di-draw" />
        <path d={smoothPath(failPts)} fill="none" stroke="#fb7185" strokeWidth="1.25" strokeDasharray="3 3" opacity="0.7" />
        {real != null && (
          <g>
            <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="rgba(255,255,255,0.18)" />
            <circle cx={hx} cy={y(raw.ok[real])} r="4" fill="#0a0f1a" stroke="#10b981" strokeWidth="2" />
          </g>
        )}
      </svg>
      {real != null && (
        <div
          className="di-glass pointer-events-none absolute top-2 z-10 rounded-lg px-3 py-2 text-[12px] shadow-xl"
          style={{ left: Math.min(Math.max(hx + 12, 0), W - 160) }}
        >
          <p className="text-[var(--muted)]">{r.label0(real)}</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" /> Succeeded <span className="ml-auto pl-4 font-medium tabular-nums">{fmt(raw.ok[real])}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-rose-400" /> Failed <span className="ml-auto pl-4 font-medium tabular-nums">{fmt(raw.failed[real])}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px]", s.text)}>
      <span className={cn("size-1.5 rounded-full", s.dot, status === "running" && "di-live text-sky-400")} />
      {s.label}
    </span>
  );
}

function RunsTable() {
  const [runs, setRuns] = useState(INITIAL_RUNS);
  const nextId = useRef(10);
  useEffect(() => {
    const rnd = seeded(99);
    const t = setInterval(() => {
      const id = nextId.current++;
      setRuns((list) => {
        const settled = list.map((r) =>
          r.status === "running" ? { ...r, status: "succeeded", duration: `${20 + Math.round(rnd() * 50)}s`, fresh: false } : { ...r, fresh: false },
        );
        const run = {
          id,
          agent: AGENTS[Math.floor(rnd() * AGENTS.length)],
          trigger: TRIGGERS[Math.floor(rnd() * TRIGGERS.length)],
          status: STATUSES[Math.floor(rnd() * STATUSES.length)],
          duration: "—",
          started: "just now",
          fresh: true,
        };
        if (run.status !== "running") run.duration = `${8 + Math.round(rnd() * 60)}s`;
        return [run, ...settled.map((r) => (r.started === "just now" ? { ...r, started: "1 min ago" } : r))].slice(0, 7);
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="di-scroll overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-[11px] font-medium text-[var(--faint)]">
            <th className="px-5 py-2.5 font-medium">Agent</th>
            <th className="px-3 py-2.5 font-medium">Trigger</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 text-right font-medium">Duration</th>
            <th className="px-5 py-2.5 text-right font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className={cn("border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]", r.fresh && "di-row-in")}>
              <td className="px-5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-md bg-white/[0.05] text-[var(--muted)]">
                    <Icon name="bot" className="size-3.5" />
                  </span>
                  <span className="font-medium">{r.agent}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-[var(--muted)]">{r.trigger}</td>
              <td className="px-3 py-2.5">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--muted)]">
                {r.status === "running" ? (
                  <span className="ml-auto inline-block h-1 w-12 overflow-hidden rounded-full bg-sky-400/20 align-middle">
                    <span className="di-run block h-full w-full" />
                  </span>
                ) : (
                  r.duration
                )}
              </td>
              <td className="px-5 py-2.5 text-right text-[var(--muted)]">{r.started}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const breathe = () => {
  const t = performance.now() / 1000;
  return 0.06 + 0.05 * Math.sin(t * 1.4) ** 2;
};

function AgentAPanel() {
  return (
    <div className="di-panel di-in flex flex-col overflow-hidden" style={anim(260)}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div>
          <p className="text-[13px] font-semibold">{SUPER_AGENT.name}</p>
          <p className="text-[11px] text-[var(--faint)]">{SUPER_AGENT.meaning}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
          <span className="di-live size-1.5 rounded-full bg-emerald-400 text-emerald-400" />
          Online
        </span>
      </div>
      <div className="flex items-center gap-4 px-5 pt-4">
        <div className="relative size-20 shrink-0 opacity-80">
          <ParticleOrb state="idle" getLevel={breathe} className="pointer-events-none absolute inset-[-20%] size-[140%]" />
        </div>
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          Ask in Hindi, English or Hinglish. Answers use your connected systems — read-only.
        </p>
      </div>
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-emerald-500/50">
          <input placeholder="Ask Agent A…" className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-[var(--faint)] outline-none" />
          <Link href="/voice" aria-label="Talk to Agent A" className="grid size-7 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-white">
            <Icon name="mic" className="size-4" />
          </Link>
        </div>
      </div>
      <ul className="mt-3 flex-1 px-2 pb-3">
        {["Aaj kitni admissions pending hain?", "Fee defaulters this week, by programme", "Which agents failed today and why?"].map((q) => (
          <li key={q}>
            <button type="button" className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12.5px] text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-white">
              <Icon name="sparkles" className="size-3.5 shrink-0 text-[var(--faint)] group-hover:text-emerald-400" />
              <span className="flex-1 truncate">{q}</span>
              <span className="translate-x-[-4px] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopAgents() {
  const max = TOP_AGENTS[0].runs;
  return (
    <ul className="space-y-3.5 px-5 py-4">
      {TOP_AGENTS.map((a, i) => (
        <li key={a.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium">{a.name}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">{fmt(a.runs)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="di-grow h-full rounded-full bg-emerald-500/80" style={{ width: `${(a.runs / max) * 100}%`, ...anim(400 + i * 70) }} />
            </div>
            <span className="w-24 shrink-0 truncate text-right text-[11px] text-[var(--faint)]">{a.owner}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PanelHeader({ title, sub, right }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        {sub && <p className="text-[11px] text-[var(--faint)]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ---------- page ----------

export default function DesignIntelligence() {
  const [range, setRange] = useState("7d");
  const k = KPIS[range];
  const s = SERIES[range];
  const rangeLabel = RANGES.find((r) => r.id === range).label;

  return (
    <div className="di-root flex min-h-screen">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="di-glass sticky top-0 z-20 flex h-14 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <span className="grid size-7 place-items-center rounded-md bg-emerald-500 text-[13px] font-bold text-[#062b1f] lg:hidden">A</span>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="hidden text-[var(--muted)] sm:inline">ATLAS SkillTech</span>
            <span className="hidden text-[var(--faint)] sm:inline">/</span>
            <span className="font-medium">Overview</span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="di-hover hidden rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-white sm:block">
              Export
            </button>
            <button type="button" className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-[#062b1f] transition-colors hover:bg-emerald-400">
              <Icon name="plus" className="size-3.5" />
              New agent
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:py-8">
          <div className="di-in flex flex-wrap items-end justify-between gap-4" style={anim(0)}>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">Overview</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">How your agents performed across ATLAS systems.</p>
            </div>
            <RangeTabs value={range} onChange={setRange} />
          </div>

          {/* KPIs */}
          <section className="grid gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
            <Kpi i={0} label="Agent runs" value={k.runs} delta={k.d[0]} spark={s.ok} hint={`vs previous ${rangeLabel}`} />
            <Kpi i={1} label="Success rate" value={k.success} decimals={1} suffix="%" delta={k.d[1]} deltaSuffix=" pts" spark={s.ok.map((v, i) => v - s.failed[i] * 20)} hint="Runs finished without error" />
            <Kpi i={2} label="Active agents" value={k.agents} delta={k.d[2]} deltaSuffix="" spark={[18, 19, 19, 20, 21, 21, 22, 24]} hint="Across 9 connected systems" />
            <Kpi i={3} label="Hours saved" value={k.saved} suffix="h" delta={k.d[3]} spark={s.ok} hint="Estimated from manual task time" />
          </section>

          {/* Chart + Agent A */}
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="di-panel di-in min-w-0" style={anim(200)}>
              <PanelHeader
                title="Runs"
                sub={`Succeeded and failed runs · ${rangeLabel}`}
                right={
                  <div className="hidden items-center gap-4 text-[11px] text-[var(--muted)] sm:flex">
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-3 rounded bg-emerald-500" /> Succeeded
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0 w-3 border-t border-dashed border-rose-400" /> Failed (×8)
                    </span>
                  </div>
                }
              />
              <div className="px-2 pb-2 pt-3 sm:px-3">
                <RunsChart range={range} />
              </div>
            </div>
            <AgentAPanel />
          </section>

          {/* Runs table + top agents */}
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="di-panel di-in min-w-0 overflow-hidden" style={anim(320)}>
              <PanelHeader
                title="Recent runs"
                sub="Updates live"
                right={
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-white">
                    View all →
                  </a>
                }
              />
              <RunsTable />
            </div>
            <div className="di-panel di-in" style={anim(380)}>
              <PanelHeader title="Most active agents" sub={`By runs · ${rangeLabel}`} />
              <TopAgents />
            </div>
          </section>

          <p className="pb-2 pt-2 text-center text-[11px] text-[var(--faint)]">Design preview · sample data</p>
        </main>
      </div>
    </div>
  );
}
