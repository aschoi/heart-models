import * as THREE from 'three';

export type LabelKind = 'deoxy' | 'oxy' | 'valve' | 'wall' | 'spark';

export interface Label {
  el: HTMLElement;
  position: THREE.Vector3;
  /** Set by the caller each frame; hidden labels are not positioned. */
  hidden: boolean;
}

export interface LabelOptions {
  text: string;
  kind: LabelKind;
  position: THREE.Vector3;
  id?: string;
  onSelect?: () => void;
}

/** HTML labels pinned to 3D points, re-projected every frame. */
export class LabelLayer {
  private readonly root: HTMLElement;
  private readonly labels: Label[] = [];
  private readonly markers: { el: HTMLElement; position: THREE.Vector3 }[] = [];
  private readonly projected = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  add(options: LabelOptions): Label {
    const el = document.createElement(options.onSelect ? 'button' : 'div');
    el.className = 'lbl';
    el.dataset['kind'] = options.kind;
    if (options.id) el.id = options.id;
    if (el instanceof HTMLButtonElement) el.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = options.text;
    el.append(dot, txt);
    if (options.onSelect) el.addEventListener('click', options.onSelect);
    this.root.appendChild(el);
    const label: Label = { el, position: options.position.clone(), hidden: false };
    this.labels.push(label);
    return label;
  }

  /** A free-floating caption, such as an orientation marker, centered on its point. */
  addMarker(text: string, position: THREE.Vector3): HTMLElement {
    const el = document.createElement('div');
    el.className = 'orient';
    el.textContent = text;
    this.root.appendChild(el);
    this.markers.push({ el, position: position.clone() });
    return el;
  }

  get all(): readonly Label[] {
    return this.labels;
  }

  update(camera: THREE.Camera, width: number, height: number, showMarkers = true): void {
    for (const label of this.labels) {
      label.el.hidden = label.hidden;
      if (!label.hidden) this.place(label.el, label.position, camera, width, height, false);
    }
    for (const marker of this.markers) {
      marker.el.hidden = !showMarkers;
      if (showMarkers) this.place(marker.el, marker.position, camera, width, height, true);
    }
  }

  private place(
    el: HTMLElement,
    position: THREE.Vector3,
    camera: THREE.Camera,
    width: number,
    height: number,
    centered: boolean,
  ): void {
    this.projected.copy(position).project(camera);
    if (this.projected.z > 1) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;
    el.style.transform = centered
      ? `translate(${x}px, ${y}px) translate(-50%, -50%)`
      : `translate(${x}px, ${y}px) translate(-4px, -50%)`;
  }
}
