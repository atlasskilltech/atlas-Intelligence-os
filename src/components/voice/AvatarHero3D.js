"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import ParticleOrb from "./ParticleOrb";

/**
 * Cartoon-style 3D armored hero (three.js, toon shading + ink outlines, built from
 * primitives — no model files). Full body in red & gold armor with a glowing chest core,
 * eye slits, palm lights and boot thrusters. It hovers, follows the pointer and acts out
 * the conversation:
 *   idle       hovers, blinks, arms relaxed
 *   listening  tilts the head, raises a hand to the ear, ear lights pulse with the mic
 *   thinking   hand to chin, looks up, chest ring spins
 *   speaking   faceplate mouth-light lip-syncs to the voice, hands gesture, head nods
 *   error      eyes and core turn red
 *
 * Props are read every frame through refs (no re-render):
 *   state     "idle" | "listening" | "thinking" | "speaking" | "error"
 *   getLevel  () => number 0..1, current audio loudness
 * Falls back to the 2D ParticleOrb when WebGL is not available.
 */

const RED = 0xc8202b;
const RED_DARK = 0x8f1520;
const GOLD = 0xf2b632;
const STEEL = 0x2b303b;
const INK = 0x0b0d14;

const GLOW = new THREE.Color(0xbff6ff);
const GLOW_THINK = new THREE.Color(0x7dd3fc);
const GLOW_ERR = new THREE.Color(0xff6b6b);

const lerp = (a, b, k) => a + (b - a) * k;

function toonGradient() {
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
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
    const CAM_Z = 10.6;
    camera.position.set(0, 0.35, CAM_Z);
    camera.lookAt(0, 0.15, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9bd7ff, 0.6);
    fill.position.set(-4, 1, 3);
    scene.add(fill);

    // ---------- materials ----------
    const grad = toonGradient();
    const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: grad });
    const red = toon(RED);
    const redDark = toon(RED_DARK);
    const gold = toon(GOLD);
    const steel = toon(STEEL);
    const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: GLOW.clone(), toneMapped: false });
    const gTex = glowTexture();
    const glowSprites = [];
    const sprite = (size, opacity = 1, follow = true) => {
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
      if (follow) glowSprites.push(s);
      return s;
    };

    /** Mesh + cartoon ink outline (inverted hull). */
    const part = (geo, mat, parent, pos = [0, 0, 0], opts = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (opts.rot) m.rotation.set(...opts.rot);
      if (opts.scale) m.scale.set(...opts.scale);
      if (opts.outline !== false) {
        const o = new THREE.Mesh(geo, inkMat);
        o.scale.setScalar(opts.outline || 1.07);
        m.add(o);
      }
      parent.add(m);
      return m;
    };
    const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 4, r);
    const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 20);
    const ball = (r) => new THREE.SphereGeometry(r, 28, 20);

    // ---------- rig ----------
    const root = new THREE.Group();
    scene.add(root);

    const aura = sprite(7.5, 0.18);
    aura.position.set(0, 0.3, -2);
    root.add(aura);

    // ground shadow + thruster light on the floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ map: gTex, color: 0x7dd3fc, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.75;
    floor.scale.set(1.6, 1.6, 1);
    scene.add(floor);

    const hero = new THREE.Group();
    root.add(hero);

    // pelvis
    const pelvis = new THREE.Group();
    hero.add(pelvis);
    part(rbox(0.92, 0.42, 0.56, 0.14), red, pelvis, [0, 0, 0]);
    part(rbox(0.96, 0.1, 0.6, 0.04), gold, pelvis, [0, 0.2, 0], { outline: 1.04 });

    // torso (abdomen + chest)
    const torso = new THREE.Group();
    torso.position.y = 0.25;
    pelvis.add(torso);
    part(cap(0.36, 0.25), gold, torso, [0, 0.32, 0], { scale: [1.15, 1, 0.9] });
    const chest = part(rbox(1.3, 0.85, 0.72, 0.22), red, torso, [0, 0.95, 0]);
    part(rbox(0.5, 0.28, 0.08, 0.06), gold, chest, [-0.34, 0.12, 0.35], { rot: [0, -0.2, 0], outline: 1.05 });
    part(rbox(0.5, 0.28, 0.08, 0.06), gold, chest, [0.34, 0.12, 0.35], { rot: [0, 0.2, 0], outline: 1.05 });
    // chest core
    const coreRing = part(new THREE.TorusGeometry(0.16, 0.04, 10, 40), steel, chest, [0, -0.1, 0.37], { outline: 1.1 });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.13, 36), glowMat);
    core.position.set(0, -0.1, 0.375);
    chest.add(core);
    const coreSpokes = new THREE.Group();
    coreSpokes.position.copy(core.position);
    coreSpokes.position.z += 0.005;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.01), steel);
      s.rotation.z = (i * Math.PI) / 3;
      s.position.set(Math.sin(-s.rotation.z) * 0.065, Math.cos(s.rotation.z) * 0.065, 0);
      coreSpokes.add(s);
    }
    chest.add(coreSpokes);
    const coreGlow = sprite(1.3, 0.8);
    coreGlow.position.set(0, -0.1, 0.45);
    chest.add(coreGlow);

    // neck + head
    part(new THREE.CylinderGeometry(0.17, 0.2, 0.25, 20), steel, torso, [0, 1.45, 0]);
    const head = new THREE.Group();
    head.position.y = 1.5;
  head.scale.setScalar(1.38); // big cartoon head
    torso.add(head);
    part(rbox(0.66, 0.76, 0.7, 0.26), red, head, [0, 0.38, -0.02]);
    part(rbox(0.12, 0.5, 0.5, 0.05), gold, head, [-0.34, 0.36, -0.04], { outline: 1.04 });
    part(rbox(0.12, 0.5, 0.5, 0.05), gold, head, [0.34, 0.36, -0.04], { outline: 1.04 });
    const faceplate = part(rbox(0.5, 0.56, 0.14, 0.07), gold, head, [0, 0.33, 0.3], { outline: 1.05 });
    part(rbox(0.3, 0.12, 0.1, 0.04), redDark, faceplate, [0, 0.27, 0.02], { outline: false }); // brow ridge
    const eyes = [-1, 1].map((side) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.02), glowMat);
      e.position.set(side * 0.11, 0.1, 0.075);
      e.rotation.z = side * -0.18;
      faceplate.add(e);
      const g = sprite(0.24, 0.8);
      g.position.set(side * 0.11, 0.1, 0.1);
      faceplate.add(g);
      return { e, g };
    });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.02), glowMat);
    mouth.position.set(0, -0.15, 0.075);
    faceplate.add(mouth);
    const mouthGlow = sprite(0.3, 0);
    mouthGlow.position.set(0, -0.15, 0.1);
    faceplate.add(mouthGlow);
    part(rbox(0.06, 0.12, 0.02, 0.01), redDark, faceplate, [-0.15, -0.16, 0.07], { outline: false });
    part(rbox(0.06, 0.12, 0.02, 0.01), redDark, faceplate, [0.15, -0.16, 0.07], { outline: false });
    const earLights = [-1, 1].map((side) => {
      const g = sprite(0.4, 0.2);
      g.position.set(side * 0.42, 0.36, -0.04);
      head.add(g);
      return g;
    });

    // arms
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.82, 1.22, 0);
      torso.add(shoulder);
      part(ball(0.31), red, shoulder, [0, 0, 0], { scale: [1.05, 0.95, 1] });
      part(rbox(0.12, 0.3, 0.5, 0.05), gold, shoulder, [side * 0.27, 0.02, 0], { outline: 1.05 });
      part(cap(0.15, 0.42), red, shoulder, [0, -0.42, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.78;
      shoulder.add(elbow);
      part(ball(0.15), steel, elbow, [0, 0, 0]);
      part(cap(0.155, 0.36), gold, elbow, [0, -0.33, 0], { scale: [1, 1, 0.95] });
      part(rbox(0.34, 0.14, 0.34, 0.05), red, elbow, [0, -0.5, 0], { outline: 1.05 });
      const hand = new THREE.Group();
      hand.position.y = -0.7;
      elbow.add(hand);
      part(rbox(0.26, 0.3, 0.14, 0.06), red, hand, [0, -0.08, 0]);
      part(rbox(0.07, 0.15, 0.08, 0.03), gold, hand, [side * -0.15, -0.02, 0.04], { rot: [0, 0, side * 0.5] }); // thumb
      const palm = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), glowMat);
      palm.position.set(0, -0.08, 0.072);
      hand.add(palm);
      const palmGlow = sprite(0.55, 0.35);
      palmGlow.position.set(0, -0.08, 0.12);
      hand.add(palmGlow);
      return { shoulder, elbow, hand, palmGlow, side };
    };
    const armR = makeArm(1);
    const armL = makeArm(-1);

    // legs
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.27, -0.18, 0);
      pelvis.add(hip);
      part(cap(0.21, 0.5), red, hip, [0, -0.45, 0]);
      part(rbox(0.3, 0.32, 0.12, 0.05), gold, hip, [0, -0.42, 0.18], { outline: 1.05 });
      const knee = new THREE.Group();
      knee.position.y = -0.92;
      hip.add(knee);
      part(ball(0.17), gold, knee, [0, 0, 0.03]);
      part(cap(0.18, 0.5), red, knee, [0, -0.45, 0]);
      part(rbox(0.36, 0.34, 0.6, 0.1), gold, knee, [0, -0.95, 0.08]);
      part(rbox(0.38, 0.1, 0.62, 0.04), red, knee, [0, -0.78, 0.08], { outline: 1.04 });
      const thrust = sprite(0.9, 0.6);
      thrust.position.set(0, -1.2, 0.05);
      knee.add(thrust);
      return { hip, knee, thrust };
    };
    const legR = makeLeg(1);
    const legL = makeLeg(-1);
    legR.hip.rotation.z = 0.05;
    legL.hip.rotation.z = -0.05;

    // sparkles
    const P = 140;
    const pPos = new Float32Array(P * 3);
    const pSeed = Array.from({ length: P }, () => [Math.random() * Math.PI * 2, 1.9 + Math.random() * 1.8, (Math.random() - 0.5) * 5]);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.07,
      map: gTex,
      color: 0xfcd34d,
      transparent: true,
      opacity: 0.75,
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
      camera.position.z = camera.aspect < 0.62 ? CAM_Z * (0.62 / camera.aspect) : CAM_Z;
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
    let coreSpin = 0;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(wrap);

    const pose = (arm, sx, sz, ex, k) => {
      arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, sx, k);
      arm.shoulder.rotation.z = lerp(arm.shoulder.rotation.z, sz * arm.side, k);
      arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, ex, k);
    };

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

      // hover
      const hover = Math.sin(t * 1.5) * 0.09;
      hero.position.y = hover;
      floor.material.opacity = 0.28 - hover * 0.6 + level * 0.15;
      for (const leg of [legR, legL]) {
        leg.thrust.material.opacity = 0.45 + Math.random() * 0.15 + level * 0.3;
        leg.thrust.scale.set(0.8 + Math.random() * 0.1, 1 + Math.random() * 0.2, 1);
      }
      legR.knee.rotation.x = lerp(legR.knee.rotation.x, 0.08 + Math.sin(t * 1.5) * 0.04, 0.1);
      legL.knee.rotation.x = lerp(legL.knee.rotation.x, 0.12 + Math.sin(t * 1.5 + 1) * 0.04, 0.1);
      legL.hip.rotation.x = lerp(legL.hip.rotation.x, -0.06, 0.1);

      // breathing
      torso.scale.set(1, 1 + Math.sin(t * 1.5 + 0.8) * 0.008, 1);

      // head look
      if (t > look.next) {
        look.tx = (Math.random() - 0.5) * 0.6;
        look.ty = (Math.random() - 0.5) * 0.2;
        look.next = t + 2 + Math.random() * 3;
      }
      const usePointer = now - pointer.last < 4000;
      let yaw = usePointer ? pointer.x * 0.45 : look.tx;
      let pitch = usePointer ? pointer.y * 0.25 : look.ty;
      if (thinking) {
        yaw = -0.25 + Math.sin(t * 0.7) * 0.06;
        pitch = -0.25;
      }
      look.x = lerp(look.x, yaw, 0.06);
      look.y = lerp(look.y, pitch, 0.06);
      const nod = speaking ? Math.sin(t * 6.5) * level * 0.09 : 0;
      head.rotation.y = look.x;
      head.rotation.x = look.y + nod;
      head.rotation.z = lerp(head.rotation.z, listening ? 0.16 : thinking ? -0.1 : 0, 0.06);
      torso.rotation.y = lerp(torso.rotation.y, look.x * 0.3, 0.05);
      torso.rotation.x = lerp(torso.rotation.x, speaking ? 0.04 : listening ? 0.06 : 0, 0.05);

      // arms
      const k = 0.08;
      if (speaking) {
        pose(armR, -0.45 - level * 0.5 + Math.sin(t * 3.1) * 0.12, 0.28 + Math.sin(t * 2.3) * 0.08, -1.0 - Math.sin(t * 4.2) * 0.3 * (0.4 + level), k);
        pose(armL, -0.25 - level * 0.35 + Math.sin(t * 2.6 + 1.5) * 0.1, 0.22, -0.7 - Math.sin(t * 3.7 + 1) * 0.25 * (0.4 + level), k);
      } else if (thinking) {
        pose(armR, -0.7, -0.3, -2.3, k); // hand to chin
        pose(armL, -0.35, -0.05, -1.45, k); // arm across the waist
      } else if (listening) {
        pose(armR, -0.05, 0.16, -0.15, k);
        pose(armL, -0.15, 0.95, -2.2, k); // hand cupped near the ear
      } else {
        pose(armR, Math.sin(t * 1.5) * 0.04, 0.16, -0.2, k);
        pose(armL, Math.sin(t * 1.5 + 1) * 0.04, 0.16, -0.25, k);
      }
      armR.hand.rotation.y = lerp(armR.hand.rotation.y, speaking ? Math.sin(t * 3) * 0.4 : 0, 0.1);
      armL.hand.rotation.y = lerp(armL.hand.rotation.y, listening ? 1.2 : speaking ? -Math.sin(t * 2.7) * 0.4 : 0, 0.1);
      armR.palmGlow.material.opacity = 0.3 + (speaking ? level * 0.6 : 0);
      armL.palmGlow.material.opacity = 0.3 + (listening ? level * 0.8 : 0);

      // eyes: blink + mood
      if (t > nextBlink) {
        blink = 1;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      }
      blink = Math.max(0, blink - dt * 7);
      const close = blink > 0.5 ? (1 - blink) * 2 : blink * 2;
      const eyeH = (thinking ? 0.6 : listening ? 1.3 : 1) * (1 - close * 0.9);
      for (const e of eyes) {
        e.e.scale.y = lerp(e.e.scale.y, Math.max(0.1, eyeH), 0.35);
        e.g.material.opacity = 0.45 + level * 0.3 + (thinking ? Math.sin(t * 6) * 0.2 : 0);
      }

      // mouth light lip-sync
      const talk = speaking ? level * (0.65 + 0.35 * Math.sin(t * 17)) : 0;
      mouth.scale.y = lerp(mouth.scale.y, 1 + talk * 4.5, 0.45);
      mouth.scale.x = lerp(mouth.scale.x, speaking ? 1 + level * 0.4 : thinking ? 0.6 : 1, 0.2);
      mouthGlow.material.opacity = lerp(mouthGlow.material.opacity, speaking ? 0.2 + level * 0.8 : 0.08, 0.2);

      for (const g of earLights) g.material.opacity = listening ? 0.3 + level * 0.8 : 0.15;

      // chest core
      coreSpin += dt * (thinking ? 4 : 0.6 + level * 3);
      coreSpokes.rotation.z = coreSpin;
      coreRing.rotation.z = -coreSpin * 0.3;
      coreGlow.scale.setScalar(1.1 + Math.sin(t * 2.4) * 0.08 + level * 0.9);
      coreGlow.material.opacity = 0.65 + level * 0.35;

      aura.material.opacity = lerp(aura.material.opacity, 0.14 + level * 0.2 + (thinking ? 0.08 : 0), 0.08);

      for (let i = 0; i < P; i++) {
        const [a0, r, y0] = pSeed[i];
        const a = a0 + t * (0.06 + (i % 5) * 0.015) * (thinking ? 2.5 : 1);
        let y = y0 + t * 0.2;
        y = ((y + 2.5) % 5 + 5) % 5 - 2.5;
        pPos[i * 3] = Math.cos(a) * r;
        pPos[i * 3 + 1] = y;
        pPos[i * 3 + 2] = Math.sin(a) * r * 0.5 - 1;
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
