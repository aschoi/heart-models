import * as THREE from 'three';
import { v3, type Vec3 } from '../shared/heart';
import { CONDUCTION_TIMING, pulseLevel, wrap } from './cycle';

const DIM = new THREE.Color(0x8c7a4e);
const BRIGHT = new THREE.Color(0xffd84a);

/** Landmarks of the conduction system, in the shared heart coordinate frame. */
export const CONDUCTION_POINTS = {
  saNode: [-1.62, 1.38, 0.62],
  avNode: [-0.62, 0.12, 0.42],
  his: [-0.3, -0.25, 0.3],
  rightBundleEnd: [0.8, -2.35, 0.3],
  leftBundleEnd: [0.95, -2.3, 0.3],
  bundleBranches: [0.55, -1.7, 0.3],
  purkinje: [2.2, -0.6, -0.3],
} as const satisfies Record<string, Vec3>;

interface PathSegment {
  curve: THREE.CatmullRomCurve3;
  material: THREE.MeshBasicMaterial;
  pulse: THREE.Mesh;
  start: number;
  end: number;
}

/**
 * SA node -> AV node -> bundle of His -> bundle branches -> Purkinje fibers.
 * Drawn without depth testing so it stays visible through the heart walls.
 */
export class ConductionSystem {
  readonly group = new THREE.Group();
  private readonly segments: PathSegment[] = [];
  private readonly saNode: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly avNode: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const p = CONDUCTION_POINTS;
    const t = CONDUCTION_TIMING;
    this.addPath([p.saNode, [-1.25, 0.8, 0.68], p.avNode], t.saToAv);
    this.addPath([p.avNode, [-0.46, -0.06, 0.36], p.his], t.his);
    this.addPath(
      [p.his, [0.086, -1.21, 0.3], [0.49, -1.96, 0.3], p.rightBundleEnd],
      t.bundleBranches,
    );
    this.addPath(
      [p.his, [0.314, -1.09, 0.3], [0.71, -1.84, 0.3], p.leftBundleEnd],
      t.bundleBranches,
    );
    this.addPath([p.rightBundleEnd, [-0.3, -2.05, 0.9], [-1.6, -1.0, 0.8]], t.purkinje);
    this.addPath([p.rightBundleEnd, [0.2, -1.9, 1.3], [-0.4, -0.6, 1.45]], t.purkinje);
    this.addPath([p.leftBundleEnd, [1.9, -1.8, 0.2], [2.2, -0.6, -0.3]], t.purkinje);
    this.addPath([p.leftBundleEnd, [1.5, -1.7, -1.1], [1.2, -0.3, -1.25]], t.purkinje);
    this.saNode = this.addNode(p.saNode);
    this.avNode = this.addNode(p.avNode);
  }

  private addPath(points: readonly Vec3[], [start, end]: readonly [number, number]): void {
    const curve = new THREE.CatmullRomCurve3(points.map(v3));
    const material = new THREE.MeshBasicMaterial({
      color: DIM.clone(),
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.045, 8, false), material);
    tube.renderOrder = 10;
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, depthTest: false }),
    );
    pulse.renderOrder = 12;
    pulse.visible = false;
    this.group.add(tube, pulse);
    this.segments.push({ curve, material, pulse, start, end });
  }

  private addNode(position: Vec3): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 14),
      new THREE.MeshBasicMaterial({ color: DIM.clone(), depthTest: false }),
    );
    node.position.copy(v3(position));
    node.renderOrder = 11;
    this.group.add(node);
    return node;
  }

  update(t: number): void {
    for (const segment of this.segments) {
      segment.material.color.copy(DIM).lerp(BRIGHT, pulseLevel(t, segment.start, segment.end));
      const since = wrap(t - segment.start);
      const duration = segment.end - segment.start;
      segment.pulse.visible = since <= duration;
      if (segment.pulse.visible) {
        segment.pulse.position.copy(segment.curve.getPointAt(Math.min(1, since / duration)));
      }
    }

    const time = wrap(t);
    const [fireStart] = CONDUCTION_TIMING.saToAv;
    const firing = time >= fireStart && time < fireStart + 30;
    this.saNode.material.color
      .copy(DIM)
      .lerp(BRIGHT, pulseLevel(t, fireStart, fireStart + 30, 220));
    this.saNode.scale.setScalar(firing ? 1.5 : 1);

    const [holdStart, holdEnd] = CONDUCTION_TIMING.avDelay;
    const holding = time >= holdStart && time < holdEnd;
    const avLevel = holding ? 1 : pulseLevel(t, holdStart, holdEnd, 220);
    this.avNode.material.color.copy(DIM).lerp(BRIGHT, avLevel);
    this.avNode.scale.setScalar(holding ? 1.25 + 0.2 * Math.sin((time - holdStart) / 9) : 1);
  }
}
