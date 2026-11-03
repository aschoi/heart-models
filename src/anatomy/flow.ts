import * as THREE from 'three';
import { v3, VESSEL_PATHS, type Vec3 } from '../shared/heart';

interface FlowPath {
  samples: THREE.Vector3[];
  mesh: THREE.InstancedMesh;
  count: number;
  /** Fraction of the path travelled per second. */
  rate: number;
  offset: number;
}

const DEOXY = 0x2f6fd6;
const OXY = 0xe0393f;
const SPEED = 1.5; // scene units per second

const [leftPvA = [], , rightPvA = []] = VESSEL_PATHS.pulmonaryVeins;
const toLungs: readonly Vec3[] = [...VESSEL_PATHS.pt];
const aortaRoute: readonly Vec3[] = VESSEL_PATHS.aorta;

/** Blood routes through the heart. Lungs are not modeled, so routes start and end at the vessels. */
const ROUTES: readonly { points: readonly Vec3[]; color: number; count: number }[] = [
  {
    // Superior vena cava -> right atrium -> right ventricle -> left pulmonary artery
    points: [
      [-1.9, 3.7, 0.0],
      [-1.9, 1.8, 0.1],
      [-1.9, 0.6, 0.2],
      [-1.3, -0.15, 0.45],
      [-0.8, -1.1, 0.55],
      [-0.45, -0.4, 0.9],
      ...toLungs,
      [2.0, 2.45, -0.7],
      [3.1, 2.2, -0.9],
    ],
    color: DEOXY,
    count: 34,
  },
  {
    // Inferior vena cava -> right atrium -> right ventricle -> right pulmonary artery
    points: [
      [-1.8, -2.75, -0.3],
      [-1.88, -1.4, -0.1],
      [-1.9, 0.2, 0.1],
      [-1.7, 0.5, 0.3],
      [-1.3, -0.15, 0.45],
      [-0.7, -1.2, 0.5],
      [-0.45, -0.4, 0.9],
      ...toLungs,
      [-0.4, 2.35, -0.95],
      [-1.9, 2.3, -0.95],
      [-3.0, 2.15, -0.8],
    ],
    color: DEOXY,
    count: 34,
  },
  {
    // Left pulmonary vein -> left atrium -> left ventricle -> aorta
    points: [
      ...[...leftPvA].reverse(),
      [0.8, 0.9, -0.6],
      [0.6, 0.2, -0.5],
      [1.0, -1.0, -0.2],
      [1.5, -2.0, 0.1],
      [1.0, -1.3, 0.2],
      [0.5, -0.5, 0.25],
      ...aortaRoute,
    ],
    color: OXY,
    count: 40,
  },
  {
    // Right pulmonary vein -> left atrium -> left ventricle -> aorta
    points: [
      ...[...rightPvA].reverse(),
      [0.6, 0.85, -0.65],
      [0.55, 0.2, -0.5],
      [0.9, -1.1, -0.3],
      [1.3, -1.9, -0.05],
      [0.85, -1.2, 0.15],
      [0.5, -0.5, 0.25],
      ...aortaRoute,
    ],
    color: OXY,
    count: 40,
  },
];

/** Particles that travel along each route, drawn with one instanced mesh per route. */
export class BloodFlow {
  private readonly paths: FlowPath[] = [];
  private readonly dummy = new THREE.Object3D();
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(0.085, 10, 8);
    for (const route of ROUTES) {
      const curve = new THREE.CatmullRomCurve3(route.points.map(v3), false, 'centripetal');
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: route.color }),
        route.count,
      );
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.paths.push({
        samples: curve.getSpacedPoints(700),
        mesh,
        count: route.count,
        rate: SPEED / curve.getLength(),
        offset: Math.random(),
      });
    }
  }

  set visible(on: boolean) {
    for (const path of this.paths) path.mesh.visible = on;
  }

  update(dtSeconds: number): void {
    this.elapsed += dtSeconds;
    for (const path of this.paths) {
      const last = path.samples.length - 1;
      for (let i = 0; i < path.count; i++) {
        const u = (this.elapsed * path.rate + i / path.count + path.offset) % 1;
        const point = path.samples[Math.floor(u * last)];
        if (!point) continue;
        this.dummy.position.copy(point);
        // Shrink particles in and out at the open ends of the route.
        this.dummy.scale.setScalar(Math.max(0.001, Math.min(1, u / 0.04, (1 - u) / 0.04)));
        this.dummy.updateMatrix();
        path.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      path.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
