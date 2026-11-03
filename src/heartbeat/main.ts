import * as THREE from 'three';
import { buildHeart, setSeeThrough, surfacePoint, v3, type ChamberKey } from '../shared/heart';
import { LabelLayer, type Label } from '../shared/labels';
import { createViewer, showFallback, type Viewer } from '../shared/viewer';
import { CONDUCTION_POINTS, ConductionSystem } from './conduction';
import {
  CYCLE_MS,
  ELECTRICAL,
  MECHANICAL,
  atrialActivation,
  atrialScale,
  avValveOpenness,
  segmentAt,
  semilunarValveOpenness,
  ventricularActivation,
  ventricularScale,
  type ElectricalKey,
  type Segment,
} from './cycle';
import { EcgStrip } from './ecgStrip';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/* ---------- Playback state ---------- */
const SPEED_MIN = 0.05;
const SPEED_MAX = 2;
const STEP_MS = 10;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const playback = {
  /** Simulated milliseconds since the start; the cycle time is simTime mod 1000. */
  simTime: 0,
  playing: !reduceMotion,
  speed: 0.25,
};

const speedSlider = byId<HTMLInputElement>('speed');
const playButton = byId<HTMLButtonElement>('play');
const sliderToSpeed = (v: number): number => SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, v / 1000);
const speedToSlider = (s: number): number =>
  Math.round((1000 * Math.log(s / SPEED_MIN)) / Math.log(SPEED_MAX / SPEED_MIN));
const formatSpeed = (s: number): string => `${Number(s.toFixed(s < 0.1 ? 3 : 2))}×`;

function setSpeed(speed: number, fromSlider = false): void {
  playback.speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
  byId('speedOut').textContent = formatSpeed(playback.speed);
  if (!fromSlider) speedSlider.value = String(speedToSlider(playback.speed));
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    const preset = Number(button.dataset['speed']);
    button.setAttribute('aria-pressed', String(Math.abs(preset - playback.speed) < 0.005));
  }
}

function setPlaying(playing: boolean): void {
  playback.playing = playing;
  playButton.textContent = playing ? 'Pause' : 'Play';
}

function step(deltaMs: number): void {
  setPlaying(false);
  playback.simTime = Math.max(0, playback.simTime + deltaMs);
}

setSpeed(playback.speed);
setPlaying(playback.playing);
speedSlider.addEventListener('input', () =>
  setSpeed(sliderToSpeed(Number(speedSlider.value)), true),
);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  button.addEventListener('click', () => setSpeed(Number(button.dataset['speed'])));
}
playButton.addEventListener('click', () => setPlaying(!playback.playing));
byId('back').addEventListener('click', () => step(-STEP_MS));
byId('fwd').addEventListener('click', () => step(STEP_MS));
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    setPlaying(!playback.playing);
  } else if (event.key === 'ArrowRight') {
    step(STEP_MS);
  } else if (event.key === 'ArrowLeft') {
    step(-STEP_MS);
  }
});

/* ---------- Live readout ---------- */
const PILL: Record<ElectricalKey, string> = {
  tp: 'TP segment',
  p: 'P wave',
  pr: 'PR segment',
  qrs: 'QRS complex',
  st: 'ST segment',
  t: 'T wave',
};

const readout = {
  electrical: null as Segment<string> | null,
  mechanical: null as Segment<string> | null,
  avOpen: null as boolean | null,
  slOpen: null as boolean | null,
};

function setValvePill(id: string, open: boolean): void {
  const pill = byId(id);
  pill.textContent = open ? 'Open' : 'Closed';
  pill.dataset['open'] = String(open);
}

function updateReadout(t: number): void {
  byId('tms').textContent = `${Math.floor(t)} ms`;
  const electrical = segmentAt(ELECTRICAL, t);
  if (electrical !== readout.electrical) {
    readout.electrical = electrical;
    byId('eName').textContent = electrical.name;
    byId('eText').textContent = electrical.summary;
    byId('segPill').textContent = PILL[electrical.key];
  }
  const mechanical = segmentAt(MECHANICAL, t);
  if (mechanical !== readout.mechanical) {
    readout.mechanical = mechanical;
    byId('mName').textContent = mechanical.name;
    byId('mText').textContent = mechanical.summary;
  }
  const avOpen = avValveOpenness(t) > 0.5;
  if (avOpen !== readout.avOpen) {
    readout.avOpen = avOpen;
    setValvePill('avPill', avOpen);
  }
  const slOpen = semilunarValveOpenness(t) > 0.5;
  if (slOpen !== readout.slOpen) {
    readout.slOpen = slOpen;
    setValvePill('slPill', slOpen);
  }
}

/* ---------- ECG strip ---------- */
const stripCanvas = byId<HTMLCanvasElement>('strip');
const strip = new EcgStrip(stripCanvas);
new ResizeObserver(() => strip.resize()).observe(stripCanvas);
const retheme = (): void => strip.readTokens();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});
void document.fonts.ready.then(() => strip.readTokens());

let scrubbing = false;
const scrubTo = (clientX: number): void => {
  const span = strip.spanMs;
  playback.simTime = Math.floor(playback.simTime / span) * span + strip.timeAtClientX(clientX);
};
stripCanvas.addEventListener('pointerdown', (event) => {
  scrubbing = true;
  stripCanvas.setPointerCapture(event.pointerId);
  setPlaying(false);
  scrubTo(event.clientX);
});
stripCanvas.addEventListener('pointermove', (event) => {
  if (scrubbing) scrubTo(event.clientX);
});
const endScrub = (): void => {
  scrubbing = false;
};
stripCanvas.addEventListener('pointerup', endScrub);
stripCanvas.addEventListener('pointercancel', endScrub);

/* ---------- 3D heart ---------- */
const stage = byId<HTMLDivElement>('stage');
let renderHeart: ((t: number) => void) | null = null;

try {
  const viewer = createViewer(stage, { home: [3.2, 1.4, 13.2], target: [0, 0.2, -0.3] });
  renderHeart = setUpHeart(viewer);
} catch {
  showFallback(
    stage,
    'This browser cannot draw WebGL, so the 3D heart is unavailable. The ECG strip and readout still work.',
  );
}

function setUpHeart(v: Viewer): (t: number) => void {
  const heart = buildHeart();
  v.scene.add(heart.group);
  const conduction = new ConductionSystem();
  conduction.group.renderOrder = 10;
  v.scene.add(conduction.group);

  const labels = new LabelLayer(byId('overlay'));
  const p = CONDUCTION_POINTS;
  const anatomy: Label[] = [
    labels.add({
      text: 'Right atrium',
      kind: 'deoxy',
      position: surfacePoint(heart.chambers.ra, [-1, 0.15, 0.35], 1.06),
    }),
    labels.add({
      text: 'Left atrium',
      kind: 'oxy',
      position: surfacePoint(heart.chambers.la, [0.3, 1, 0.15], 1.06),
    }),
    labels.add({
      text: 'Right ventricle',
      kind: 'deoxy',
      position: surfacePoint(heart.chambers.rv, [-0.55, -0.5, 0.7], 1.06),
    }),
    labels.add({
      text: 'Left ventricle',
      kind: 'oxy',
      position: surfacePoint(heart.chambers.lv, [0.75, -0.3, 0.6], 1.06),
    }),
  ];
  const conductionLabels: Label[] = [
    labels.add({ text: 'SA node', kind: 'spark', position: v3(p.saNode) }),
    labels.add({ text: 'AV node', kind: 'spark', position: v3(p.avNode) }),
    labels.add({ text: 'Bundle of His', kind: 'spark', position: v3(p.his) }),
    labels.add({ text: 'Bundle branches', kind: 'spark', position: v3(p.bundleBranches) }),
    labels.add({ text: 'Purkinje fibers', kind: 'spark', position: v3(p.purkinje) }),
  ];

  const display = { seeThrough: true, conduction: true, labels: true };
  const applySeeThrough = (): void => setSeeThrough(heart.shells, display.seeThrough, 0.4);
  applySeeThrough();
  byId<HTMLInputElement>('tglGlass').addEventListener('change', (event) => {
    display.seeThrough = (event.target as HTMLInputElement).checked;
    applySeeThrough();
  });
  byId<HTMLInputElement>('tglCond').addEventListener('change', (event) => {
    display.conduction = (event.target as HTMLInputElement).checked;
    conduction.group.visible = display.conduction;
  });
  byId<HTMLInputElement>('tglLabels').addEventListener('change', (event) => {
    display.labels = (event.target as HTMLInputElement).checked;
  });
  byId('reset').addEventListener('click', () => v.resetView());
  if (matchMedia('(pointer: coarse)').matches) {
    byId('hint').textContent = 'Drag to rotate · Pinch to zoom';
  }

  const spark = new THREE.Color(0xffb13b);
  const atria: ChamberKey[] = ['ra', 'la'];
  const ventricles: ChamberKey[] = ['rv', 'lv', 'septum'];
  const glow = new THREE.Color();

  return (t: number): void => {
    const vScale = ventricularScale(t);
    const aScale = atrialScale(t);
    glow.copy(spark).multiplyScalar(0.5 * atrialActivation(t));
    for (const key of atria) {
      heart.chambers[key].scale.copy(heart.baseScales[key]).multiplyScalar(aScale);
      heart.chambers[key].material.emissive.copy(glow);
    }
    glow.copy(spark).multiplyScalar(0.5 * ventricularActivation(t));
    for (const key of ventricles) {
      heart.chambers[key].scale.copy(heart.baseScales[key]).multiplyScalar(vScale);
      heart.chambers[key].material.emissive.copy(glow);
    }

    const av = avValveOpenness(t);
    const sl = semilunarValveOpenness(t);
    for (const [valve, open] of [
      [heart.valves.tricuspid, av],
      [heart.valves.mitral, av],
      [heart.valves.pulmonaryValve, sl],
      [heart.valves.aorticValve, sl],
    ] as const) {
      valve.disc.scale.setScalar(0.08 + 0.92 * (1 - open));
      valve.disc.material.opacity = 0.2 + 0.6 * (1 - open);
    }

    conduction.update(t);
    v.render();
    for (const label of anatomy) label.hidden = !display.labels;
    for (const label of conductionLabels) label.hidden = !display.labels || !display.conduction;
    labels.update(v.camera, v.size.width, v.size.height);
  };
}

/* ---------- Main loop: one clock drives everything ---------- */
let last = performance.now();
const frame = (now: number): void => {
  requestAnimationFrame(frame);
  const elapsed = Math.min(now - last, 60);
  last = now;
  if (playback.playing) playback.simTime += elapsed * playback.speed;
  const t = playback.simTime % CYCLE_MS;
  renderHeart?.(t);
  strip.draw(playback.simTime);
  updateReadout(t);
};
requestAnimationFrame(frame);
