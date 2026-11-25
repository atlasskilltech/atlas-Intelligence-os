"use client";

import { useEffect, useRef } from "react";

/**
 * Glowing particle sphere (canvas 2D, no dependencies) in the ATLAS emerald/navy theme.
 * It breathes when idle, ripples with the microphone while listening, swirls while
 * thinking and pulses with the assistant's voice while speaking.
 *
 * Props are read every frame through refs, so changing them never re-renders the canvas:
 *   state     "idle" | "listening" | "thinking" | "speaking" | "error"
 *   getLevel  () => number 0..1, current audio loudness (mic or assistant voice)
 */

const SPHERE_POINTS = 4200;
const RIBBONS = 4;
const RIBBON_POINTS = 700;
const DUST = 140;

// Theme palette (src/app/globals.css): brand emerald + a cool teal/cyan accent for depth.
const BUCKETS = [
  [6, 78, 59], // back: brand-900
  [4, 120, 87], // brand-700
  [16, 185, 129], // brand-500
  [52, 211, 153], // brand-400
  [110, 231, 183], // brand-300
  [209, 250, 229], // front highlights: brand-100
];
const ACCENT = [34, 211, 238]; // cyan-400 — a few "spark" particles
const ERROR_TINT = [248, 113, 113];

function fibonacciSphere(n) {
  const pts = new Float32Array(n * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = Math.max(-1, Math.min(1, 1 - (i / (n - 1)) * 2 + (Math.random() - 0.5) * 0.012));
    const r = Math.sqrt(1 - y * y);
    const th = golden * i + (Math.random() - 0.5) * 0.25;
    pts[i * 4] = Math.cos(th) * r;
    pts[i * 4 + 1] = y;
    pts[i * 4 + 2] = Math.sin(th) * r;
    pts[i * 4 + 3] = Math.random() * Math.PI * 2; // phase
  }
  return pts;
}

// Cheap smooth "noise" on the sphere: a sum of travelling waves along fixed directions.
const DIRS = [
  [0.8, 0.3, 0.5],
  [-0.4, 0.9, 0.2],
  [0.1, -0.5, 0.85],
  [-0.7, -0.2, 0.6],
];
function field(x, y, z, t) {
  let v = 0;
  for (let k = 0; k < DIRS.length; k++) {
    const d = DIRS[k];
    v += Math.sin((x * d[0] + y * d[1] + z * d[2]) * (2.2 + k * 0.9) + t * (0.9 + k * 0.35));
  }
  return v / DIRS.length;
}

export default function ParticleOrb({ state = "idle", getLevel, className = "" }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const levelRef = useRef(getLevel);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    levelRef.current = getLevel;
  }, [getLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const sphere = fibonacciSphere(SPHERE_POINTS);
    const sparks = new Uint8Array(SPHERE_POINTS).map(() => (Math.random() < 0.035 ? 1 : 0));
    const ribbons = Array.from({ length: RIBBONS }, (_, i) => ({
      tiltX: Math.random() * Math.PI,
      tiltZ: Math.random() * Math.PI,
      speed: 0.12 + Math.random() * 0.18,
      phase: (i / RIBBONS) * Math.PI * 2,
      width: 0.08 + Math.random() * 0.1,
      offsets: Float32Array.from({ length: RIBBON_POINTS }, () => Math.random() - 0.5),
    }));
    const dust = Array.from({ length: DUST }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 1.08 + Math.random() * 0.55,
      y: (Math.random() - 0.5) * 1.6,
      s: 0.05 + Math.random() * 0.15,
      p: Math.random() * Math.PI * 2,
    }));
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");
    const canBlur = typeof octx.filter === "string";
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      off.width = canvas.width;
      off.height = canvas.height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const buckets = BUCKETS.map(() => []);
    const sparkBucket = [];
    let raf = 0;
    let t = 0;
    let last = performance.now();
    let level = 0; // smoothed
    let energy = 0.2; // smoothed "activity" per state
    let spin = 0;

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const raw = Math.max(0, Math.min(1, levelRef.current?.() || 0));
      level += (raw - level) * (raw > level ? 0.35 : 0.08);
      const target = { idle: 0.15, listening: 0.35, thinking: 0.75, speaking: 0.55, error: 0.1 }[st] ?? 0.2;
      energy += (target - energy) * 0.04;
      const speed = reduceMotion ? 0.25 : 1;
      t += dt * speed * (0.6 + energy * 1.4);
      spin += dt * speed * (0.12 + energy * 0.5 + level * 0.6);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const pulse = st === "thinking" ? Math.sin(t * 4) * 0.015 : 0;
      const R = Math.min(w, h) * 0.34 * (1 + level * 0.12 + pulse);
      const focal = R * 3.2;

      // Soft glow behind the orb.
      ctx.globalCompositeOperation = "source-over";
      const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.6);
      const ga = 0.16 + energy * 0.12 + level * 0.25;
      const tint = st === "error" ? "248,113,113" : "16,185,129";
      glow.addColorStop(0, `rgba(${tint},${ga})`);
      glow.addColorStop(0.45, `rgba(${tint},${ga * 0.35})`);
      glow.addColorStop(1, "rgba(15,23,42,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, w, h);
      octx.globalCompositeOperation = "lighter";
      for (const b of buckets) b.length = 0;
      sparkBucket.length = 0;

      const cosY = Math.cos(spin);
      const sinY = Math.sin(spin);
      const tilt = 0.35 + Math.sin(t * 0.2) * 0.08;
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);
      const amp = 0.035 + energy * 0.05 + level * 0.22;

      const project = (x, y, z, bright, spark) => {
        // rotate Y then X
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const s = focal / (focal + z2 * R);
        const px = cx + x1 * R * s;
        const py = cy + y1 * R * s;
        const depth = (1 - z2) / 2; // 0 back .. 1 front (z towards viewer is negative)
        let bi = Math.floor(Math.min(0.999, Math.max(0, depth * 0.85 + bright)) * BUCKETS.length);
        if (bi >= BUCKETS.length) bi = BUCKETS.length - 1;
        const size = (0.6 + depth * 0.8 + bright * 1.1) * s;
        (spark ? sparkBucket : buckets[bi]).push(px, py, size);
      };

      // Sphere shell.
      for (let i = 0; i < SPHERE_POINTS; i++) {
        const o = i * 4;
        const x = sphere[o];
        const y = sphere[o + 1];
        const z = sphere[o + 2];
        const n = field(x, y, z, t);
        const shimmer = Math.sin(t * 2 + sphere[o + 3]) * 0.008;
        const r = 1 + n * amp + shimmer;
        project(x * r, y * r, z * r, Math.max(0, n) * (0.15 + level * 0.4), sparks[i] === 1);
      }

      // Flowing ribbons — the bright swirls across the surface.
      for (const rb of ribbons) {
        const cA = Math.cos(rb.tiltX + t * 0.05);
        const sA = Math.sin(rb.tiltX + t * 0.05);
        const cB = Math.cos(rb.tiltZ);
        const sB = Math.sin(rb.tiltZ);
        const head = t * rb.speed * 2 + rb.phase;
        for (let j = 0; j < RIBBON_POINTS; j++) {
          const u = (j / RIBBON_POINTS) * Math.PI * 2;
          const wave = Math.sin(u * 3 + t * 1.3 + rb.phase) * (0.25 + energy * 0.25 + level * 0.4);
          const off = rb.offsets[j] * rb.width;
          let x = Math.cos(u);
          let y = wave * 0.35 + off;
          let z = Math.sin(u);
          const len = Math.hypot(x, y, z);
          const rr = 1.005 + Math.abs(off) * 0.2 + level * 0.06;
          x = (x / len) * rr;
          y = (y / len) * rr;
          z = (z / len) * rr;
          // orient the ribbon
          const y2 = y * cA - z * sA;
          const z2 = y * sA + z * cA;
          const x3 = x * cB - y2 * sB;
          const y3 = x * sB + y2 * cB;
          // brighter near the moving "head", fading behind it
          const d = ((u - head) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const trail = Math.max(0, 1 - d / (Math.PI * 1.3));
          if (trail <= 0.02) continue;
          project(x3, y3, z2, 0.15 + trail * (0.45 + level * 0.3), false);
        }
      }

      // Draw buckets (one fillStyle per bucket keeps this fast).
      const tintMix = st === "error" ? 0.6 : 0;
      for (let b = 0; b < buckets.length; b++) {
        const arr = buckets[b];
        if (!arr.length) continue;
        const c = BUCKETS[b];
        const col = c.map((v, k) => Math.round(v * (1 - tintMix) + ERROR_TINT[k] * tintMix));
        octx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.35 + b * 0.11})`;
        for (let k = 0; k < arr.length; k += 3) {
          const s = arr[k + 2];
          octx.fillRect(arr[k] - s / 2, arr[k + 1] - s / 2, s, s);
        }
      }
      if (sparkBucket.length) {
        octx.fillStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},0.85)`;
        for (let k = 0; k < sparkBucket.length; k += 3) {
          const s = sparkBucket[k + 2] * 1.3;
          octx.fillRect(sparkBucket[k] - s / 2, sparkBucket[k + 1] - s / 2, s, s);
        }
      }

      // Floating dust around the orb.
      octx.fillStyle = "rgba(110,231,183,0.45)";
      for (const p of dust) {
        const a = p.a + t * p.s * 0.6;
        const r = p.r * R * (1 + level * 0.15);
        const x = cx + Math.cos(a) * r;
        const y = cy + p.y * R + Math.sin(t * 0.8 + p.p) * 6;
        const s = 0.8 + Math.sin(t * 2 + p.p) * 0.4;
        octx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t + p.p));
        octx.fillRect(x, y, s, s);
      }
      octx.globalAlpha = 1;

      // Composite: blurred copy for the bloom, then the sharp particles on top.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      if (canBlur) {
        ctx.filter = `blur(${Math.round(6 * dpr)}px)`;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(off, 0, 0);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(off, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
