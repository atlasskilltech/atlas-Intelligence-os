"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import ParticleOrb from "./ParticleOrb";

/**
 * 3D talking assistant (three.js, built from primitives — no model files to download).
 * A friendly robot head + shoulders in the ATLAS emerald/navy theme:
 *   idle       floats, blinks, looks around and follows the pointer
 *   listening  leans in, ear rings and aura pulse with the microphone
 *   thinking   eyes narrow and look up, halo spins, antenna blinks
 *   speaking   mouth "equalizer" lip-syncs to the assistant's voice, head nods
 *   error      eyes and glow turn red
 *
 * Props are read every frame through refs, so changing them never re-renders the canvas:
 *   state     "idle" | "listening" | "thinking" | "speaking" | "error"
 *   getLevel  () => number 0..1, current audio loudness (mic or assistant voice)
 * Falls back to the 2D ParticleOrb when WebGL is not available.
 */

const EMERALD = new THREE.Color(0x34d399);
const CYAN = new THREE.Color(0x22d3ee);
const RED = new THREE.Color(0xf87171);
const AMBER = new THREE.Color(0xa7f3d0);

const MOUTH_BARS = 11;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Point on a sphere of radius r at (x, y), facing outward. */
function onSurface(obj, x, y, r) {
  const z = Math.sqrt(Math.max(0, r * r - x * x - y * y));
  obj.position.set(x, y, z);
  obj.lookAt(x * 2, y * 2, z * 2);
}

const lerp = (a, b, k) => a + (b - a) * k;

export default function Avatar3D({ state = "idle", getLevel, className = "" }) {
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, -0.15, 6.4);
    camera.lookAt(0, -0.3, 0);

    // ---------- lights ----------
    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x041018, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 3, 4);
    scene.add(key);
    const rimL = new THREE.PointLight(0x10b981, 14, 12, 2);
    rimL.position.set(-3, 1, -1.5);
    scene.add(rimL);
    const rimR = new THREE.PointLight(0x22d3ee, 10, 12, 2);
    rimR.position.set(3, 0.5, -1.5);
    scene.add(rimR);
    const faceLight = new THREE.PointLight(0x34d399, 0, 3, 2); // glow from the eyes onto the visor
    faceLight.position.set(0, 0.1, 1.6);
    scene.add(faceLight);

    // ---------- materials ----------
    const shell = new THREE.MeshPhysicalMaterial({
      color: 0xeef3f8,
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
    });
    const dark = new THREE.MeshPhysicalMaterial({
      color: 0x050b18,
      roughness: 0.12,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    const metal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.85 });
    const glowMat = new THREE.MeshBasicMaterial({ color: EMERALD.clone(), toneMapped: false });
    const accentMat = new THREE.MeshBasicMaterial({ color: CYAN.clone(), toneMapped: false });
    const gTex = glowTexture();
    const sprite = (color, size, opacity = 1) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: gTex,
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      s.scale.setScalar(size);
      return s;
    };

    // ---------- rig ----------
    const root = new THREE.Group();
    scene.add(root);
    const body = new THREE.Group();
    root.add(body);
    const head = new THREE.Group();
    head.position.y = 0.05;
    root.add(head);

    // aura behind everything
    const aura = sprite(EMERALD.clone(), 5.2, 0.32);
    aura.position.set(0, -0.1, -1.4);
    root.add(aura);

    // halo rings
    const halo = new THREE.Group();
    halo.position.set(0, 0.05, -0.55);
    root.add(halo);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.012, 8, 160), glowMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.006, 8, 160), accentMat);
    ring2.rotation.x = 0.35;
    halo.add(ring1, ring2);
    const haloDots = [];
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), i === 1 ? accentMat : glowMat);
      halo.add(d);
      haloDots.push(d);
    }

    // head shell + visor
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shell);
    skull.scale.set(1, 0.98, 0.96);
    head.add(skull);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 64, 40, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.12),
      dark,
    );
    visor.scale.copy(skull.scale);
    head.add(visor);
    const visorRim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.02, 10, 96), metal);
    visorRim.scale.set(1, 0.62, 1);
    visorRim.position.set(0, -0.02, 0.5);
    head.add(visorRim);

    // face (eyes + mouth) sits on the visor; it can shift a little to "look"
    const face = new THREE.Group();
    head.add(face);
    const FACE_R = 0.985;
    const eyeGeo = new THREE.CapsuleGeometry(0.085, 0.14, 8, 24);
    const eyes = [-0.33, 0.33].map((x) => {
      const pivot = new THREE.Group();
      onSurface(pivot, x, 0.14, FACE_R);
      const eye = new THREE.Mesh(eyeGeo, glowMat);
      eye.scale.z = 0.35;
      pivot.add(eye);
      const glow = sprite(EMERALD.clone(), 0.75, 0.75);
      glow.position.z = 0.02;
      pivot.add(glow);
      face.add(pivot);
      return { pivot, eye, glow };
    });
    const cheeks = [-0.52, 0.52].map((x) => {
      const c = sprite(new THREE.Color(0xf472b6), 0.32, 0);
      onSurface(c, x, -0.12, FACE_R + 0.01);
      face.add(c);
      return c;
    });
    const barGeo = new THREE.BoxGeometry(0.042, 0.1, 0.02);
    const bars = [];
    for (let i = 0; i < MOUTH_BARS; i++) {
      const u = i / (MOUTH_BARS - 1) - 0.5; // -0.5 .. 0.5
      const x = u * 0.52;
      const smile = -0.3 + u * u * 0.12;
      const pivot = new THREE.Group();
      onSurface(pivot, x, smile, FACE_R);
      const bar = new THREE.Mesh(barGeo, glowMat);
      pivot.add(bar);
      face.add(pivot);
      bars.push({ bar, u, phase: Math.random() * Math.PI * 2, freq: 9 + Math.random() * 9 });
    }
    const mouthGlow = sprite(EMERALD.clone(), 0.9, 0);
    onSurface(mouthGlow, 0, -0.3, FACE_R + 0.02);
    face.add(mouthGlow);

    // ears
    const earRings = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 40), metal);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.97, 0, 0);
      head.add(ear);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 40), shell);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * 1.07, 0, 0);
      head.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 10, 48), glowMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(side * 1.06, 0, 0);
      head.add(ring);
      const g = sprite(EMERALD.clone(), 0.7, 0.2);
      g.position.set(side * 1.12, 0, 0);
      head.add(g);
      earRings.push(g);
    }

    // antenna
    const antenna = new THREE.Group();
    antenna.position.set(0, 0.95, 0);
    head.add(antenna);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.38, 12), metal);
    stalk.position.y = 0.19;
    antenna.add(stalk);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    antenna.add(base);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), accentMat);
    tip.position.y = 0.42;
    antenna.add(tip);
    const tipGlow = sprite(CYAN.clone(), 0.55, 0.8);
    tipGlow.position.y = 0.42;
    antenna.add(tipGlow);

    // neck + shoulders
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.55, 32), metal);
    neck.position.y = -1.05;
    body.add(neck);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 12, 48), glowMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -1.28;
    body.add(collar);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), shell);
    torso.scale.set(1.5, 0.82, 0.9);
    torso.position.y = -2.05;
    body.add(torso);
    const chest = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), accentMat);
    chest.position.set(0, -1.68, 0.73);
    chest.rotation.x = -0.45;
    body.add(chest);
    const chestRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 10, 48), metal);
    chestRing.position.copy(chest.position);
    chestRing.rotation.x = chest.rotation.x;
    body.add(chestRing);
    const chestGlow = sprite(CYAN.clone(), 0.9, 0.5);
    chestGlow.position.set(0, -1.66, 0.8);
    body.add(chestGlow);

    // floating particles
    const P = 260;
    const pPos = new Float32Array(P * 3);
    const pSeed = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) {
      pSeed[i * 3] = Math.random() * Math.PI * 2; // angle
      pSeed[i * 3 + 1] = 1.7 + Math.random() * 1.4; // radius
      pSeed[i * 3 + 2] = (Math.random() - 0.5) * 3.4; // height
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.045,
      map: gTex,
      color: EMERALD.clone(),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(pGeo, pMat);
    particles.position.y = -0.3;
    scene.add(particles);

    // ---------- sizing ----------
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the whole bust visible in narrow (portrait) boxes
      camera.position.z = camera.aspect < 0.85 ? 6.4 / Math.max(0.55, camera.aspect / 0.85) : 6.4;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---------- pointer follow ----------
    const pointer = { x: 0, y: 0, last: 0 };
    const onPointer = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.last = performance.now();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // ---------- animation ----------
    const eyeColor = EMERALD.clone();
    const targetColor = new THREE.Color();
    let level = 0;
    let t = 0;
    let last = performance.now();
    let nextBlink = 1.5 + Math.random() * 3;
    let blink = 0; // 0..1, 1 = closed
    let look = { x: 0, y: 0, tx: 0, ty: 0, next: 2 };
    let haloSpin = 0;
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
      const speed = reduceMotion ? 0.35 : 1;
      t += dt * speed;
      const st = stateRef.current;
      const raw = Math.max(0, Math.min(1, levelRef.current?.() || 0));
      level += (raw - level) * (raw > level ? 0.45 : 0.12);

      const speaking = st === "speaking";
      const listening = st === "listening";
      const thinking = st === "thinking";
      const error = st === "error";

      // colour of the "lights"
      targetColor.copy(error ? RED : thinking ? CYAN : speaking ? AMBER : EMERALD);
      eyeColor.lerp(targetColor, 0.08);
      glowMat.color.copy(eyeColor);
      for (const e of eyes) e.glow.material.color.copy(eyeColor);
      mouthGlow.material.color.copy(eyeColor);
      aura.material.color.copy(eyeColor);
      pMat.color.copy(eyeColor);
      faceLight.color.copy(eyeColor);
      faceLight.intensity = lerp(faceLight.intensity, 1.2 + level * 3, 0.1);

      // body float + breathing
      const float = Math.sin(t * 1.1) * 0.06;
      root.position.y = float;
      body.scale.y = 1 + Math.sin(t * 1.1 + 0.6) * 0.008;

      // where the head looks: pointer (if recent) or a slow wander
      if (t > look.next) {
        look.tx = (Math.random() - 0.5) * 0.5;
        look.ty = (Math.random() - 0.5) * 0.25;
        look.next = t + 2 + Math.random() * 3;
      }
      const usePointer = now - pointer.last < 4000;
      let yaw = usePointer ? pointer.x * 0.38 : look.tx;
      let pitch = usePointer ? pointer.y * 0.22 : look.ty;
      if (thinking) {
        yaw = 0.28 + Math.sin(t * 0.7) * 0.08;
        pitch = -0.22;
      } else if (listening) {
        pitch += 0.06; // lean in a little
      }
      look.x = lerp(look.x, yaw, 0.06);
      look.y = lerp(look.y, pitch, 0.06);
      const nod = speaking ? Math.sin(t * 7) * level * 0.06 : 0;
      head.rotation.y = look.x;
      head.rotation.x = look.y + nod;
      head.rotation.z = listening ? lerp(head.rotation.z, 0.08, 0.05) : lerp(head.rotation.z, Math.sin(t * 0.6) * 0.03, 0.05);
      body.rotation.y = look.x * 0.25;
      face.position.x = look.x * 0.05;
      face.position.y = -look.y * 0.05;

      // blinking
      if (t > nextBlink) {
        blink = 1;
        nextBlink = t + 2.2 + Math.random() * 3.5;
        if (Math.random() < 0.2) nextBlink = t + 0.25; // double blink
      }
      blink = Math.max(0, blink - dt * 7);
      const close = blink > 0.5 ? (1 - blink) * 2 : blink * 2; // 0 → 1 → 0
      const eyeOpen = thinking ? 0.45 : listening ? 1.15 : 1;
      for (const e of eyes) {
        const sy = Math.max(0.08, eyeOpen * (1 - close * 0.92));
        e.eye.scale.y = lerp(e.eye.scale.y, sy, 0.35);
        e.eye.scale.x = lerp(e.eye.scale.x, thinking ? 1.15 : 1, 0.1);
        e.glow.material.opacity = 0.55 + level * 0.35 + (thinking ? Math.sin(t * 6) * 0.15 : 0);
      }

      // mouth: a soft smile line at rest, an equalizer while speaking
      let mouthEnergy = 0;
      for (const b of bars) {
        const env = 1 - Math.abs(b.u) * 1.5;
        let h = 0.32;
        if (speaking) {
          const wobble = 0.55 + 0.45 * Math.sin(t * b.freq + b.phase);
          h = 0.35 + level * 4.2 * Math.max(0.15, env) * wobble;
        } else if (thinking) {
          h = 0.32 + Math.max(0, Math.sin(t * 6 - b.u * 10)) * 0.5;
        } else if (listening) {
          h = 0.32 + level * 0.8 * Math.max(0.2, env);
        }
        b.bar.scale.y = lerp(b.bar.scale.y, h, 0.4);
        mouthEnergy += b.bar.scale.y;
      }
      mouthGlow.material.opacity = Math.min(0.8, (mouthEnergy / MOUTH_BARS - 0.3) * 0.6 + (speaking ? 0.15 : 0));
      for (const c of cheeks) c.material.opacity = lerp(c.material.opacity, speaking ? 0.12 + level * 0.15 : 0.05, 0.05);

      // ears react to the mic
      for (const g of earRings) {
        const s = 0.6 + (listening ? level * 1.4 : 0) + Math.sin(t * 2) * 0.04;
        g.scale.setScalar(s);
        g.material.opacity = listening ? 0.35 + level * 0.6 : 0.18;
        g.material.color.copy(eyeColor);
      }

      // antenna
      const blinkRate = thinking ? 8 : 2;
      tipGlow.material.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * blinkRate));
      antenna.rotation.z = Math.sin(t * 1.6) * 0.06 - look.x * 0.1;

      // chest core pulses
      chestGlow.scale.setScalar(0.8 + Math.sin(t * 2.2) * 0.08 + level * 0.6);

      // halo
      haloSpin += dt * speed * (thinking ? 2.6 : 0.35 + level * 1.2);
      ring1.rotation.z = haloSpin;
      ring2.rotation.z = -haloSpin * 0.7;
      haloDots.forEach((d, i) => {
        const a = haloSpin * (thinking ? 1.5 : 1) + (i * Math.PI * 2) / 3;
        d.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0);
        d.visible = thinking || speaking;
      });
      const haloScale = 1 + level * 0.08 + (thinking ? Math.sin(t * 4) * 0.015 : 0);
      halo.scale.setScalar(haloScale);
      halo.rotation.y = look.x * 0.4;

      aura.material.opacity = lerp(aura.material.opacity, 0.22 + level * 0.35 + (thinking ? 0.12 : 0) + (error ? 0.1 : 0), 0.08);
      aura.scale.setScalar(5.2 + level * 1.2);

      // particles drift upward around the bust
      for (let i = 0; i < P; i++) {
        const a = pSeed[i * 3] + t * (0.05 + (i % 7) * 0.01) * (thinking ? 3 : 1);
        const r = pSeed[i * 3 + 1] * (1 + level * 0.1);
        let y = pSeed[i * 3 + 2] + t * 0.12;
        y = ((y + 1.7) % 3.4 + 3.4) % 3.4 - 1.7;
        pPos[i * 3] = Math.cos(a) * r;
        pPos[i * 3 + 1] = y;
        pPos[i * 3 + 2] = Math.sin(a) * r * 0.6 - 0.8;
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
      gTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (fallback) return <ParticleOrb state={state} getLevel={getLevel} className={className} />;
  return <div ref={wrapRef} className={className} aria-hidden="true" />;
}
