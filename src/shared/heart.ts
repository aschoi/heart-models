import * as THREE from 'three';

/**
 * Stylized heart geometry shared by both models.
 *
 * Coordinates use the patient's frame: -x is the patient's right, +y is superior,
 * +z is anterior (toward a viewer standing in front of the patient).
 */

export type Vec3 = readonly [number, number, number];

export const v3 = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

export const COLORS = {
  deoxy: 0x4d76ab,
  oxy: 0xb4454c,
  valve: 0xece2cc,
  wall: 0xc58a77,
} as const;

export type ChamberKey = 'ra' | 'rv' | 'la' | 'lv' | 'septum';
export type VesselKey = 'svc' | 'ivc' | 'aorta' | 'pt' | 'pa' | 'pv';
export type ValveKey = 'tricuspid' | 'mitral' | 'pulmonaryValve' | 'aorticValve';
export type StructureKey = ChamberKey | VesselKey | ValveKey;

export type WallMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/** Centerlines of the great vessels. Blood-flow paths reuse these points. */
export const VESSEL_PATHS = {
  svc: [
    [-1.9, 1.3, 0.15],
    [-1.92, 2.5, 0.05],
    [-1.9, 3.8, 0.0],
  ],
  ivc: [
    [-1.9, -0.1, 0.05],
    [-1.88, -1.4, -0.1],
    [-1.8, -2.8, -0.3],
  ],
  aorta: [
    [0.3, 0.0, 0.2],
    [-0.1, 1.2, 0.4],
    [-0.3, 2.4, 0.4],
    [0.1, 3.5, -0.3],
    [0.8, 3.6, -1.0],
    [1.3, 3.0, -1.8],
    [1.4, 1.5, -2.6],
    [1.4, -1.5, -2.6],
    [1.4, -3.2, -2.5],
  ],
  pt: [
    [-0.35, 0.1, 1.0],
    [-0.15, 0.8, 1.15],
    [0.3, 1.7, 1.0],
    [0.7, 2.2, 0.5],
    [0.9, 2.3, -0.3],
  ],
  leftPa: [
    [0.9, 2.3, -0.3],
    [2.0, 2.45, -0.7],
    [3.1, 2.2, -0.9],
  ],
  rightPa: [
    [0.9, 2.3, -0.3],
    [-0.4, 2.35, -0.95],
    [-1.9, 2.3, -0.95],
    [-3.0, 2.15, -0.8],
  ],
  pulmonaryVeins: [
    [
      [1.55, 1.15, -1.05],
      [2.3, 1.3, -1.4],
      [3.0, 1.35, -1.6],
    ],
    [
      [1.6, 0.6, -1.0],
      [2.3, 0.45, -1.35],
      [3.0, 0.35, -1.55],
    ],
    [
      [-0.1, 1.15, -1.1],
      [-1.3, 1.25, -1.5],
      [-2.5, 1.3, -1.6],
    ],
    [
      [-0.1, 0.6, -1.05],
      [-1.3, 0.5, -1.45],
      [-2.5, 0.4, -1.55],
    ],
  ],
} satisfies Record<string, readonly Vec3[] | readonly (readonly Vec3[])[]>;

interface ChamberSpec {
  color: number;
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
}

const CHAMBERS: Record<ChamberKey, ChamberSpec> = {
  ra: { color: COLORS.deoxy, position: [-1.9, 0.6, 0.2], scale: [1.0, 1.1, 1.0] },
  rv: {
    color: COLORS.deoxy,
    position: [-0.6, -0.8, 0.5],
    scale: [1.55, 1.45, 1.0],
    rotation: [0, 0, 0.25],
  },
  la: { color: COLORS.oxy, position: [0.7, 0.9, -0.6], scale: [1.15, 0.8, 0.9] },
  lv: {
    color: COLORS.oxy,
    position: [1.0, -1.2, -0.1],
    scale: [1.35, 2.0, 1.35],
    rotation: [-0.35, 0, 0.55],
  },
  septum: {
    color: COLORS.wall,
    position: [0.2, -1.15, 0.2],
    scale: [0.14, 1.45, 0.95],
    rotation: [0, 0, 0.5],
  },
};

export interface Valve {
  key: ValveKey;
  group: THREE.Group;
  ring: WallMesh;
  disc: WallMesh;
  center: THREE.Vector3;
}

export interface Heart {
  group: THREE.Group;
  chambers: Record<ChamberKey, WallMesh>;
  baseScales: Record<ChamberKey, THREE.Vector3>;
  /** Chamber walls and vessels, excluding the septum and valves. */
  shells: WallMesh[];
  /** Every mesh that can be picked, each tagged with userData.key. */
  pickables: WallMesh[];
  curves: { aorta: THREE.CatmullRomCurve3; pt: THREE.CatmullRomCurve3 };
  valves: Record<ValveKey, Valve>;
}

export interface HeartOptions {
  /** Planes applied to walls and vessels. Valves are never clipped. */
  clippingPlanes?: THREE.Plane[];
}

export function wallMaterial(
  color: number,
  clippingPlanes: THREE.Plane[] = [],
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.04,
    side: THREE.DoubleSide,
    clippingPlanes,
  });
}

function tag(mesh: WallMesh, key: StructureKey, clipped: boolean): WallMesh {
  mesh.userData = { key, clipped };
  return mesh;
}

export function structureKeyOf(object: THREE.Object3D): StructureKey | undefined {
  const key: unknown = object.userData['key'];
  return typeof key === 'string' ? (key as StructureKey) : undefined;
}

export function isClipped(object: THREE.Object3D): boolean {
  return object.userData['clipped'] === true;
}

export function buildHeart(options: HeartOptions = {}): Heart {
  const planes = options.clippingPlanes ?? [];
  const group = new THREE.Group();
  const shells: WallMesh[] = [];
  const pickables: WallMesh[] = [];

  const makeChamber = (key: ChamberKey): WallMesh => {
    const spec = CHAMBERS[key];
    const mesh: WallMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 56, 36),
      wallMaterial(spec.color, planes),
    );
    mesh.position.copy(v3(spec.position));
    mesh.scale.copy(v3(spec.scale));
    if (spec.rotation) mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
    mesh.updateMatrixWorld();
    tag(mesh, key, true);
    group.add(mesh);
    pickables.push(mesh);
    if (key !== 'septum') shells.push(mesh);
    return mesh;
  };

  const chambers: Record<ChamberKey, WallMesh> = {
    ra: makeChamber('ra'),
    rv: makeChamber('rv'),
    la: makeChamber('la'),
    lv: makeChamber('lv'),
    septum: makeChamber('septum'),
  };
  const baseScales: Record<ChamberKey, THREE.Vector3> = {
    ra: chambers.ra.scale.clone(),
    rv: chambers.rv.scale.clone(),
    la: chambers.la.scale.clone(),
    lv: chambers.lv.scale.clone(),
    septum: chambers.septum.scale.clone(),
  };

  const makeVessel = (
    key: VesselKey,
    points: readonly Vec3[],
    radius: number,
    color: number,
  ): THREE.CatmullRomCurve3 => {
    const curve = new THREE.CatmullRomCurve3(points.map(v3));
    const mesh: WallMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 80, radius, 24, false),
      wallMaterial(color, planes),
    );
    tag(mesh, key, true);
    group.add(mesh);
    shells.push(mesh);
    pickables.push(mesh);
    return curve;
  };

  makeVessel('svc', VESSEL_PATHS.svc, 0.38, COLORS.deoxy);
  makeVessel('ivc', VESSEL_PATHS.ivc, 0.42, COLORS.deoxy);
  const aorta = makeVessel('aorta', VESSEL_PATHS.aorta, 0.48, COLORS.oxy);
  const pt = makeVessel('pt', VESSEL_PATHS.pt, 0.42, COLORS.deoxy);
  makeVessel('pa', VESSEL_PATHS.leftPa, 0.32, COLORS.deoxy);
  makeVessel('pa', VESSEL_PATHS.rightPa, 0.32, COLORS.deoxy);
  for (const vein of VESSEL_PATHS.pulmonaryVeins) makeVessel('pv', vein, 0.22, COLORS.oxy);

  const zAxis = new THREE.Vector3(0, 0, 1);
  const makeValve = (
    key: ValveKey,
    center: THREE.Vector3,
    normal: THREE.Vector3,
    radius: number,
  ): Valve => {
    const valveGroup = new THREE.Group();
    const ring: WallMesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.075, 14, 48),
      wallMaterial(COLORS.valve),
    );
    const disc: WallMesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.96, 40),
      new THREE.MeshStandardMaterial({
        color: COLORS.valve,
        roughness: 0.7,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      }),
    );
    for (const part of [ring, disc]) {
      tag(part, key, false);
      valveGroup.add(part);
      pickables.push(part);
    }
    valveGroup.position.copy(center);
    valveGroup.quaternion.setFromUnitVectors(zAxis, normal.clone().normalize());
    group.add(valveGroup);
    return { key, group: valveGroup, ring, disc, center: center.clone() };
  };

  const valves: Record<ValveKey, Valve> = {
    tricuspid: makeValve('tricuspid', v3([-1.3, -0.15, 0.45]), v3([1.3, -1.4, 0.3]), 0.5),
    mitral: makeValve('mitral', v3([0.6, 0.2, -0.5]), v3([0.3, -2.1, 0.5]), 0.5),
    pulmonaryValve: makeValve('pulmonaryValve', pt.getPointAt(0.12), pt.getTangentAt(0.12), 0.38),
    aorticValve: makeValve('aorticValve', aorta.getPointAt(0.05), aorta.getTangentAt(0.05), 0.44),
  };

  return { group, chambers, baseScales, shells, pickables, curves: { aorta, pt }, valves };
}

/** A point just outside a chamber's surface, in the direction given in its local frame. */
export function surfacePoint(mesh: THREE.Object3D, direction: Vec3, offset = 1.05): THREE.Vector3 {
  mesh.updateMatrixWorld();
  return mesh.localToWorld(v3(direction).normalize().multiplyScalar(offset));
}

/** Switch walls and vessels between opaque and see-through. */
export function setSeeThrough(
  meshes: readonly WallMesh[],
  seeThrough: boolean,
  opacity = 0.3,
): void {
  for (const mesh of meshes) {
    mesh.material.transparent = seeThrough;
    mesh.material.opacity = seeThrough ? opacity : 1;
    mesh.material.depthWrite = !seeThrough;
    mesh.material.needsUpdate = true;
  }
}
