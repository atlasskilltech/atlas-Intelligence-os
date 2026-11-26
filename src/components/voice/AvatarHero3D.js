"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import ParticleOrb from "./ParticleOrb";

/**
 * Bold, poster-style 3D armored hero bust (three.js, flat two-tone shading + thick black
 * ink gaps between plates, built from primitives — no model files). Red & gold angular
 * armor, a large glowing chest core, layered shoulder plates with joint lights, and an
 * original helmet: crest fin, chevron visor, cheek vents and a light-bar mouth grille.
 *
 *   idle       breathes, blinks, looks around and follows the pointer
 *   listening  leans in and tilts the head, joint lights pulse with the mic
 *   thinking   looks up and aside, visor narrows, chest core ring spins
 *   speaking   mouth grille lip-syncs to the voice, head nods, chest core pulses
 *   error      visor and core turn red
 *
 * Props are read every frame through refs (no re-render):
 *   state     "idle" | "listening" | "thinking" | "speaking" | "error"
 *   getLevel  () => number 0..1, current audio loudness
 * Falls back to the 2D ParticleOrb when WebGL is not available.
 */

const RED = 0xe0202a;
const RED_DARK = 0x9e121b;
const GOLD = 0xf6b21b;
const STEEL = 0x1a1d24;
const INK = 0x000000;

const GLOW = new THREE.Color(0xe8fbff);
const GLOW_THINK = new THREE.Color(0x8ad8ff);
const GLOW_ERR = new THREE.Color(0xff5a5a);

const lerp = (a, b, k) => a + (b - a) * k;

function toonGradient() {
  // two hard tones = flat poster look
  const data = new Uint8Array([120, 120, 120, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.14)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function AvatarHero3D({ state = "idle", getLevel, className = "" }) {
  const wrapRef = useRef(null);
  const stateRef = useRef(state);
  const levelRef = useRef(getLevel);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    levelRef.current = getLevel;
  }, [getLevel]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setFallback(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    const CAM_Z = 9.2;
    camera.position.set(0, 0.1, CAM_Z);
    camera.lookAt(0, -0.2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.5, 4, 6);
    scene.add(key);

    // ---------- materials ----------
    const grad = toonGradient();
    const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: grad });
    const red = toon(RED);
    const redDark = toon(RED_DARK);
    const gold = toon(GOLD);
    const steel = new THREE.MeshBasicMaterial({ color: STEEL });
    const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: GLOW.clone(), toneMapped: false });
    const gTex = glowTexture();
    const glowSprites = [];
    const sprite = (size, opacity = 1) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: gTex,
          color: GLOW.clone(),
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      s.scale.setScalar(size);
      glowSprites.push(s);
      return s;
    };

    /** Mesh + thick black ink hull (reads as the cut lines between plates on a dark page). */
    const part = (geo, mat, parent, pos = [0, 0, 0], opts = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (opts.rot) m.rotation.set(...opts.rot);
      if (opts.scale) m.scale.set(...opts.scale);
      if (opts.outline !== false) {
        const o = new THREE.Mesh(geo, inkMat);
        o.scale.setScalar(opts.outline || 1.06);
        m.add(o);
      }
      parent.add(m);
      return m;
    };
    const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const halfBall = (r) => new THREE.SphereGeometry(r, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);

    // ---------- rig ----------
    const root = new THREE.Group();
    scene.add(root);
    const aura = sprite(8, 0.1);
    aura.position.set(0, -0.2, -3);
    root.add(aura);

    // torso
    const torso = new THREE.Group();
    torso.position.y = -1.35;
    root.add(torso);
    // base chest volume (dark — the plates sit on it so the gaps read black)
    part(rbox(2.3, 1.7, 1.15, 0.45), steel, torso, [0, 0.05, -0.05], { outline: false });
    // pectoral plates
    for (const s of [-1, 1]) {
      part(rbox(1.0, 0.72, 0.3, 0.12), red, torso, [s * 0.58, 0.32, 0.46], { rot: [0.05, s * 0.32, s * -0.12] });
      part(rbox(0.62, 0.22, 0.12, 0.06), gold, torso, [s * 0.5, 0.8, 0.36], { rot: [-0.5, s * 0.2, s * -0.25] }); // gold collar
      part(rbox(0.45, 0.62, 0.25, 0.1), red, torso, [s * 0.95, -0.25, 0.32], { rot: [0, s * 0.55, s * 0.18] }); // side ribs
      part(rbox(0.12, 0.42, 0.1, 0.04), gold, torso, [s * 1.12, -0.32, 0.36], { rot: [0, s * 0.6, s * 0.2] }); // gold rib accent
      part(rbox(0.55, 0.28, 0.25, 0.1), red, torso, [s * 0.34, -0.62, 0.44], { rot: [0.15, s * 0.18, s * 0.1] }); // abs
    }
    part(rbox(0.7, 0.2, 0.22, 0.08), red, torso, [0, -0.92, 0.38], { rot: [0.25, 0, 0] });

    // chest core
    const corePos = new THREE.Vector3(0, 0.1, 0.8);
    const coreRingOuter = part(new THREE.TorusGeometry(0.42, 0.07, 14, 60), red, torso, corePos.toArray(), { outline: 1.12 });
    const coreRingInner = part(new THREE.TorusGeometry(0.33, 0.035, 10, 60), redDark, torso, [corePos.x, corePos.y, corePos.z + 0.02], { outline: false });
    const coreNotches = new THREE.Group();
    coreNotches.position.set(corePos.x, corePos.y, corePos.z + 0.05);
    for (let i = 0; i < 10; i++) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.02), steel);
      const a = (i / 10) * Math.PI * 2;
      n.position.set(Math.cos(a) * 0.375, Math.sin(a) * 0.375, 0);
      n.rotation.z = a + Math.PI / 2;
      coreNotches.add(n);
    }
    torso.add(coreNotches);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.29, 48), glowMat);
    core.position.set(corePos.x, corePos.y, corePos.z + 0.01);
    torso.add(core);
    const coreGlow = sprite(1.3, 0.45);
    coreGlow.position.set(corePos.x, corePos.y, corePos.z + 0.2);
    torso.add(coreGlow);

    // shoulders: layered pauldrons + upper arms + joint lights
    const shoulders = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 1.3, 0.55, 0);
      sh.scale.setScalar(0.88);
      torso.add(sh);
      part(halfBall(0.55), red, sh, [0, -0.05, 0], { rot: [0, 0, s * -0.55], scale: [1, 0.75, 1] });
      part(halfBall(0.46), redDark, sh, [s * 0.22, -0.28, 0], { rot: [0, 0, s * -0.8], scale: [1, 0.6, 1] });
      part(halfBall(0.38), red, sh, [s * 0.38, -0.5, 0], { rot: [0, 0, s * -1.0], scale: [1, 0.5, 1] });
      part(rbox(0.3, 0.14, 0.42, 0.05), gold, sh, [s * -0.15, 0.25, 0.1], { rot: [0, 0, s * -0.4] }); // gold trim
      const arm = part(new THREE.CapsuleGeometry(0.3, 0.7, 6, 20), red, sh, [s * 0.42, -0.95, -0.05], { rot: [0, 0, s * 0.22] });
      part(rbox(0.2, 0.5, 0.2, 0.06), redDark, arm, [s * 0.18, 0.05, 0.18], { outline: false });
      // joint light disc facing forward/outward
      const joint = new THREE.Group();
      joint.position.set(s * 0.62, -0.6, 0.28);
      joint.rotation.y = s * 0.7;
      sh.add(joint);
      part(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 32), red, joint, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], outline: 1.15 });
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), glowMat);
      dot.position.z = 0.045;
      joint.add(dot);
      const jg = sprite(0.5, 0.4);
      jg.position.z = 0.1;
      joint.add(jg);
      shoulders.push({ sh, jg, s });
    }

    // neck
    part(new THREE.CylinderGeometry(0.3, 0.38, 0.5, 24), steel, torso, [0, 1.05, -0.05], { outline: false });
    for (const s of [-1, 1]) part(rbox(0.22, 0.35, 0.2, 0.06), gold, torso, [s * 0.32, 1.02, 0.12], { rot: [0, 0, s * 0.35] });

    // head (original design: crest fin, chevron visor, cheek vents, light-bar grille)
    const head = new THREE.Group();
    head.position.set(0, -0.12, 0.05);
    head.scale.setScalar(1.22);
    root.add(head);
    part(rbox(1.02, 1.2, 1.05, 0.42), red, head, [0, 0.42, -0.04]); // helmet shell
    part(rbox(0.16, 0.34, 1.0, 0.07), redDark, head, [0, 1.02, -0.06]); // crest fin
    part(rbox(0.08, 0.2, 0.7, 0.03), gold, head, [0, 1.14, -0.02], { outline: 1.08 });
    for (const s of [-1, 1]) {
      part(rbox(0.1, 0.5, 0.55, 0.04), redDark, head, [s * 0.52, 0.42, -0.1], { outline: false }); // ear plate
      part(rbox(0.06, 0.3, 0.3, 0.03), gold, head, [s * 0.56, 0.42, -0.1], { outline: 1.08 });
    }
    // gold face
    const face = new THREE.Group();
    face.position.set(0, 0.36, 0.44);
    head.add(face);
    part(rbox(0.8, 0.78, 0.22, 0.14), gold, face, [0, 0.05, 0]); // face plate
    part(rbox(0.86, 0.2, 0.2, 0.08), red, face, [0, 0.42, 0.04], { rot: [0.25, 0, 0] }); // brow band
    part(rbox(0.5, 0.26, 0.2, 0.08), gold, face, [0, -0.38, 0.0], { rot: [-0.25, 0, 0] }); // chin
    // chevron visor
    const visor = new THREE.Group();
    visor.position.set(0, 0.18, 0.12);
    face.add(visor);
    part(rbox(0.7, 0.16, 0.06, 0.03), steel, visor, [0, -0.02, -0.01], { outline: false });
    const visorHalves = [-1, 1].map((s) => {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.02), glowMat);
      v.position.set(s * 0.15, -0.01, 0.025);
      v.rotation.z = s * 0.2;
      visor.add(v);
      return v;
    });
    const visorGlow = sprite(0.7, 0.45);
    visorGlow.position.set(0, 0.0, 0.1);
    visor.add(visorGlow);
    // cheek vents
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), steel);
        v.position.set(s * 0.25, -0.08 - i * 0.07, 0.115);
        v.rotation.z = s * -0.25;
        face.add(v);
      }
    }
    // mouth light-bar grille
    const mouthSlot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.02), steel);
    mouthSlot.position.set(0, -0.27, 0.112);
    face.add(mouthSlot);
    const mouthBars = [];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), glowMat);
      b.position.set((i - 2) * 0.055, -0.27, 0.12);
      face.add(b);
      mouthBars.push({ b, ph: Math.random() * 6.28, f: 12 + Math.random() * 8, env: 1 - Math.abs(i - 2) * 0.25 });
    }
    const mouthGlow = sprite(0.28, 0);
    mouthGlow.position.set(0, -0.27, 0.18);
    face.add(mouthGlow);

    // embers
    const P = 120;
    const pPos = new Float32Array(P * 3);
    const pSeed = Array.from({ length: P }, () => [Math.random() * Math.PI * 2, 2.2 + Math.random() * 1.6, (Math.random() - 0.5) * 5]);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.06,
      map: gTex,
      color: 0xffb347,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(pGeo, pMat));

    // ---------- sizing ----------
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = camera.aspect < 0.95 ? CAM_Z * (0.95 / camera.aspect) : CAM_Z;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const pointer = { x: 0, y: 0, last: 0 };
    const onPointer = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.last = performance.now();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // ---------- animation ----------
    const glowColor = GLOW.clone();
    const target = new THREE.Color();
    let level = 0;
    let t = 0;
    let last = performance.now();
    let blink = 0;
    let nextBlink = 2;
    const look = { x: 0, y: 0, tx: 0, ty: 0, next: 2 };
    let spin = 0;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(wrap);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * (reduceMotion ? 0.35 : 1);
      const st = stateRef.current;
      const raw = Math.max(0, Math.min(1, levelRef.current?.() || 0));
      level += (raw - level) * (raw > level ? 0.45 : 0.12);
      const speaking = st === "speaking";
      const listening = st === "listening";
      const thinking = st === "thinking";
      const error = st === "error";

      target.copy(error ? GLOW_ERR : thinking ? GLOW_THINK : GLOW);
      glowColor.lerp(target, 0.08);
      glowMat.color.copy(glowColor);
      for (const s of glowSprites) s.material.color.copy(glowColor);

      // breathing + slight sway
      const breath = Math.sin(t * 1.3);
      root.position.y = breath * 0.03;
      torso.scale.set(1 + breath * 0.006, 1 + breath * 0.01, 1);
      for (const s of shoulders) s.sh.position.y = 0.55 + breath * 0.02 + (listening ? 0.04 : 0);

      // head look
      if (t > look.next) {
        look.tx = (Math.random() - 0.5) * 0.5;
        look.ty = (Math.random() - 0.5) * 0.18;
        look.next = t + 2 + Math.random() * 3;
      }
      const usePointer = now - pointer.last < 4000;
      let yaw = usePointer ? pointer.x * 0.4 : look.tx;
      let pitch = usePointer ? pointer.y * 0.22 : look.ty;
      if (thinking) {
        yaw = -0.3 + Math.sin(t * 0.7) * 0.06;
        pitch = -0.2;
      } else if (listening) {
        pitch += 0.08;
      }
      look.x = lerp(look.x, yaw, 0.06);
      look.y = lerp(look.y, pitch, 0.06);
      const nod = speaking ? Math.sin(t * 6.5) * level * 0.08 : 0;
      head.rotation.y = look.x;
      head.rotation.x = look.y + nod;
      head.rotation.z = lerp(head.rotation.z, listening ? 0.14 : thinking ? -0.1 : 0, 0.06);
      head.position.z = lerp(head.position.z, listening ? 0.15 : 0.05, 0.05);
      torso.rotation.y = lerp(torso.rotation.y, look.x * 0.25, 0.05);
      torso.rotation.z = lerp(torso.rotation.z, speaking ? Math.sin(t * 2.2) * 0.02 : 0, 0.05);

      // visor blink / mood
      if (t > nextBlink) {
        blink = 1;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      }
      blink = Math.max(0, blink - dt * 7);
      const close = blink > 0.5 ? (1 - blink) * 2 : blink * 2;
      const open = (thinking ? 0.5 : listening ? 1.35 : 1) * (1 - close * 0.9);
      for (const v of visorHalves) v.scale.y = lerp(v.scale.y, Math.max(0.12, open), 0.35);
      visorGlow.material.opacity = 0.4 + level * 0.35 + (thinking ? Math.sin(t * 6) * 0.15 : 0);

      // mouth grille lip-sync
      for (const m of mouthBars) {
        const h = speaking ? 0.5 + level * 1.6 * m.env * (0.55 + 0.45 * Math.sin(t * m.f + m.ph)) : thinking ? 0.4 + 0.4 * Math.max(0, Math.sin(t * 6 + m.ph)) : 0.45;
        m.b.scale.y = lerp(m.b.scale.y, Math.min(1.7, h), 0.45);
      }
      mouthGlow.material.opacity = lerp(mouthGlow.material.opacity, speaking ? 0.2 + level * 0.7 : 0.05, 0.2);

      // joint lights react to the mic / voice
      for (const s of shoulders) s.jg.material.opacity = 0.3 + (listening || speaking ? level * 0.7 : 0);

      // chest core
      spin += dt * (thinking ? 3.5 : 0.4 + level * 2.5);
      coreNotches.rotation.z = spin;
      coreRingInner.rotation.z = -spin * 0.5;
      coreRingOuter.rotation.z = spin * 0.1;
      coreGlow.scale.setScalar(1.25 + Math.sin(t * 2.4) * 0.06 + level * 0.7);
      coreGlow.material.opacity = 0.35 + level * 0.35;

      aura.material.opacity = lerp(aura.material.opacity, 0.08 + level * 0.15, 0.08);

      for (let i = 0; i < P; i++) {
        const [a0, r, y0] = pSeed[i];
        const a = a0 + t * (0.05 + (i % 5) * 0.012) * (thinking ? 2.5 : 1);
        let y = y0 + t * 0.25;
        y = ((y + 2.5) % 5 + 5) % 5 - 2.5;
        pPos[i * 3] = Math.cos(a) * r;
        pPos[i * 3 + 1] = y;
        pPos[i * 3 + 2] = Math.sin(a) * r * 0.5 - 1.2;
      }
      pGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      });
      inkMat.dispose();
      grad.dispose();
      gTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (fallback) return <ParticleOrb state={state} getLevel={getLevel} className={className} />;
  return <div ref={wrapRef} className={className} aria-hidden="true" />;
}
