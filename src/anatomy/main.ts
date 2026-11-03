import * as THREE from 'three';
import {
  buildHeart,
  isClipped,
  setSeeThrough,
  structureKeyOf,
  surfacePoint,
  v3,
  type Heart,
  type StructureKey,
} from '../shared/heart';
import { LabelLayer, type Label } from '../shared/labels';
import { createViewer, showFallback, type Viewer } from '../shared/viewer';
import { BloodFlow } from './flow';
import { GROUPS, INTERIOR, KIND_LABEL, PARTS } from './parts';

type ViewMode = 'exterior' | 'cutaway' | 'xray';

const MODE_NOTES: Record<ViewMode, string> = {
  exterior: 'The outside of the heart as it sits in the chest, with its front surface facing you.',
  cutaway:
    'The front of the heart is cut away so you can see into the chambers and where the valves sit.',
  xray: 'The walls turn see-through so you can follow blood through the whole heart.',
};

/** Points with z above this value are removed in the cutaway view. */
const CUT_Z = -0.15;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

let occlusionDirty = true;
let onSelect: (key: StructureKey) => void = () => undefined;

const state = {
  selected: 'lv' as StructureKey,
  hovered: null as StructureKey | null,
  mode: 'exterior' as ViewMode,
  showLabels: true,
};

/* ---------- Side panel ---------- */
const partsEl = byId<HTMLDivElement>('parts');
for (const [title, keys] of GROUPS) {
  const group = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  for (const key of keys) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `part-${key}`;
    button.dataset['key'] = key;
    button.dataset['kind'] = PARTS[key].kind;
    button.textContent = PARTS[key].name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(key));
    row.appendChild(button);
  }
  group.append(heading, row);
  partsEl.appendChild(group);
}

function renderInfo(key: StructureKey): void {
  const part = PARTS[key];
  const chip = byId('infoChip');
  chip.textContent = KIND_LABEL[part.kind];
  chip.dataset['kind'] = part.kind;
  byId('infoName').textContent = part.name;
  byId('infoText').textContent = part.description;
  const facts = byId('infoFacts');
  facts.replaceChildren(
    ...part.facts.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }),
  );
  for (const button of partsEl.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset['key'] === key));
  }
}

byId('modeNote').textContent = MODE_NOTES.exterior;
renderInfo(state.selected);

/* ---------- 3D scene ---------- */
const stage = byId<HTMLDivElement>('stage');
const overlay = byId<HTMLDivElement>('overlay');
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);

let viewer: Viewer | null = null;
try {
  viewer = createViewer(stage, {
    home: [3.4, 1.6, 13.8],
    target: [0, 0.3, -0.4],
    localClipping: true,
    onResize: () => {
      occlusionDirty = true;
    },
  });
} catch {
  showFallback(
    stage,
    'This browser cannot draw WebGL, so the 3D model is unavailable. The structure list still describes each part.',
  );
}

if (viewer) start(viewer);

function start(v: Viewer): void {
  const heart: Heart = buildHeart({ clippingPlanes: [clipPlane] });
  v.scene.add(heart.group);
  const flow = new BloodFlow(v.scene);
  const labels = new LabelLayer(overlay);
  let flowOn = false;

  const anchors: [StructureKey, THREE.Vector3][] = [
    ['ra', surfacePoint(heart.chambers.ra, [-1, 0.15, 0.35])],
    ['rv', surfacePoint(heart.chambers.rv, [0.05, -0.1, 1])],
    ['la', surfacePoint(heart.chambers.la, [0.3, 1, 0.15])],
    ['lv', surfacePoint(heart.chambers.lv, [0.6, -0.45, 0.66])],
    ['svc', v3([-1.9, 3.3, 0.42])],
    ['ivc', v3([-1.82, -2.3, 0.22])],
    ['aorta', v3([0.45, 4.12, -0.65])],
    ['pt', v3([0.3, 1.75, 1.47])],
    ['pa', v3([3.0, 2.6, -0.85])],
    ['pv', v3([2.9, 1.62, -1.55])],
    ['tricuspid', heart.valves.tricuspid.center],
    ['mitral', heart.valves.mitral.center],
    ['pulmonaryValve', heart.valves.pulmonaryValve.center],
    ['aorticValve', heart.valves.aorticValve.center],
    ['septum', v3([0.2, -1.6, 0.2])],
  ];
  const labelFor = new Map<Label, StructureKey>();
  for (const [key, position] of anchors) {
    const label = labels.add({
      text: PARTS[key].name,
      kind: PARTS[key].kind,
      position,
      id: `lbl-${key}`,
      onSelect: () => select(key),
    });
    labelFor.set(label, key);
  }
  labels.addMarker("Patient's right", v3([-4.4, -3.1, 0]));
  labels.addMarker("Patient's left", v3([4.4, -3.1, 0]));

  const refreshHighlight = (): void => {
    for (const mesh of heart.pickables) {
      const key = structureKeyOf(mesh);
      const hex = key === state.selected ? 0x3d3d3d : key === state.hovered ? 0x1f1f1f : 0x000000;
      mesh.material.emissive.setHex(hex);
    }
    for (const [label, key] of labelFor)
      label.el.classList.toggle('active', key === state.selected);
  };

  const setMode = (mode: ViewMode): void => {
    state.mode = mode;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset['mode'] === mode));
    }
    byId('modeNote').textContent = MODE_NOTES[mode];
    clipPlane.constant = mode === 'cutaway' ? CUT_Z : 100;
    setSeeThrough(heart.shells, mode === 'xray', 0.2);
    occlusionDirty = true;
  };

  onSelect = (key: StructureKey): void => {
    if (INTERIOR.has(key) && state.mode === 'exterior') setMode('cutaway');
    refreshHighlight();
    occlusionDirty = true;
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset['mode'] as ViewMode));
  }
  byId<HTMLInputElement>('tglLabels').addEventListener('change', (event) => {
    state.showLabels = (event.target as HTMLInputElement).checked;
  });
  byId<HTMLInputElement>('tglFlow').addEventListener('change', (event) => {
    const on = (event.target as HTMLInputElement).checked;
    flow.visible = on;
    flowOn = on;
    if (on && state.mode === 'exterior') setMode('xray');
  });
  byId('reset').addEventListener('click', () => v.resetView());
  v.controls.addEventListener('change', () => {
    occlusionDirty = true;
  });

  /* Picking and hover */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const visibleHit = (hits: THREE.Intersection[]): THREE.Intersection | undefined =>
    hits.find((hit) => !(state.mode === 'cutaway' && isClipped(hit.object) && hit.point.z > CUT_Z));
  const hitAt = (clientX: number, clientY: number): StructureKey | undefined => {
    const rect = v.renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, v.camera);
    const hit = visibleHit(raycaster.intersectObjects(heart.pickables, false));
    return hit ? structureKeyOf(hit.object) : undefined;
  };
  let down: { x: number; y: number } | null = null;
  const canvas = v.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 6) {
      const key = hitAt(e.clientX, e.clientY);
      if (key) select(key);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const key = hitAt(e.clientX, e.clientY) ?? null;
    canvas.style.cursor = key ? 'pointer' : 'grab';
    if (key !== state.hovered) {
      state.hovered = key;
      refreshHighlight();
    }
  });
  canvas.addEventListener('pointerleave', () => {
    if (state.hovered) {
      state.hovered = null;
      refreshHighlight();
    }
  });
  if (matchMedia('(pointer: coarse)').matches) {
    byId('hint').textContent = 'Drag to rotate · Pinch to zoom · Tap a part';
  }

  /* Dim labels hidden behind other structures. Recomputed only after the view changes. */
  const occlusionRay = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const updateOcclusion = (): void => {
    for (const [label, key] of labelFor) {
      let behind = false;
      if (state.mode !== 'xray') {
        direction.copy(label.position).sub(v.camera.position);
        const distance = direction.length();
        direction.normalize();
        occlusionRay.set(v.camera.position, direction);
        occlusionRay.far = Math.max(0, distance - 0.3);
        const hits = occlusionRay
          .intersectObjects(heart.shells, false)
          .filter((hit) => !(state.mode === 'cutaway' && hit.point.z > CUT_Z));
        behind = hits.some(
          (hit) =>
            structureKeyOf(hit.object) !== key ||
            (!INTERIOR.has(key) && hit.distance < distance - 0.6),
        );
      }
      label.el.classList.toggle('behind', behind);
    }
  };

  let lastOcclusion = 0;
  let lastFrame = performance.now();
  refreshHighlight();

  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (flowOn) flow.update(dt);
    v.render();
    for (const [label, key] of labelFor) {
      label.hidden = !state.showLabels || (INTERIOR.has(key) && state.mode === 'exterior');
    }
    labels.update(v.camera, v.size.width, v.size.height, state.showLabels);
    if (occlusionDirty && now - lastOcclusion > 120) {
      lastOcclusion = now;
      occlusionDirty = false;
      updateOcclusion();
    }
  };
  requestAnimationFrame(frame);
}

function select(key: StructureKey): void {
  state.selected = key;
  renderInfo(key);
  onSelect(key);
}
