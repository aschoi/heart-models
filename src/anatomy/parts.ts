import type { StructureKey } from '../shared/heart';

export type PartKind = 'deoxy' | 'oxy' | 'valve' | 'wall';

export interface Part {
  name: string;
  kind: PartKind;
  description: string;
  facts: readonly (readonly [label: string, value: string])[];
}

export const KIND_LABEL: Record<PartKind, string> = {
  deoxy: 'Deoxygenated blood',
  oxy: 'Oxygenated blood',
  valve: 'Valve',
  wall: 'Muscle wall',
};

export const PARTS: Record<StructureKey, Part> = {
  ra: {
    name: 'Right atrium',
    kind: 'deoxy',
    description:
      "Collects deoxygenated blood returning from the body. The sinoatrial (SA) node, the heart's natural pacemaker, sits in its wall near where the superior vena cava enters, so every normal heartbeat starts here.",
    facts: [
      ['Receives', 'Superior and inferior vena cava'],
      ['Sends to', 'Right ventricle, through the tricuspid valve'],
    ],
  },
  rv: {
    name: 'Right ventricle',
    kind: 'deoxy',
    description:
      'Pumps deoxygenated blood to the lungs. It sits at the front of the chest, so it is most of what you see when you look at the heart from the front. Its wall is thin, normally under about 5 mm, because the lung circuit is low pressure.',
    facts: [
      ['Receives', 'Right atrium'],
      ['Sends to', 'Pulmonary trunk, through the pulmonary valve'],
    ],
  },
  la: {
    name: 'Left atrium',
    kind: 'oxy',
    description:
      'Collects freshly oxygenated blood from the lungs. It is the most posterior chamber of the heart and lies directly in front of the esophagus, which is why it can be imaged through the esophagus.',
    facts: [
      ['Receives', 'Four pulmonary veins'],
      ['Sends to', 'Left ventricle, through the mitral valve'],
    ],
  },
  lv: {
    name: 'Left ventricle',
    kind: 'oxy',
    description:
      'Pumps oxygenated blood through the aorta to the entire body. It forms the apex of the heart and has the thickest wall, normally about 6 to 11 mm, because it works against the high pressure of the systemic circulation.',
    facts: [
      ['Receives', 'Left atrium'],
      ['Sends to', 'Aorta, through the aortic valve'],
    ],
  },
  septum: {
    name: 'Interventricular septum',
    kind: 'wall',
    description:
      'The muscular wall that divides the right and left ventricles. The bundle branches of the conduction system run down it, carrying the electrical signal to the ventricles, and it contracts as part of the left ventricle.',
    facts: [
      ['Separates', 'Right and left ventricles'],
      ['Carries', 'Right and left bundle branches'],
    ],
  },
  tricuspid: {
    name: 'Tricuspid valve',
    kind: 'valve',
    description:
      'Three leaflets between the right atrium and right ventricle. It opens to let the ventricle fill and shuts when the ventricle contracts, so blood cannot flow back into the atrium.',
    facts: [
      ['Leaflets', 'Three'],
      ['Between', 'Right atrium and right ventricle'],
    ],
  },
  mitral: {
    name: 'Mitral valve',
    kind: 'valve',
    description:
      'Two leaflets between the left atrium and left ventricle, the only heart valve with two. Its closure, together with the tricuspid valve, produces the first heart sound (S1).',
    facts: [
      ['Leaflets', 'Two'],
      ['Between', 'Left atrium and left ventricle'],
    ],
  },
  pulmonaryValve: {
    name: 'Pulmonary valve',
    kind: 'valve',
    description:
      'Three half-moon shaped (semilunar) cusps at the exit of the right ventricle. It opens when the right ventricle contracts and closes so blood cannot fall back from the pulmonary trunk.',
    facts: [
      ['Cusps', 'Three, semilunar'],
      ['Between', 'Right ventricle and pulmonary trunk'],
    ],
  },
  aorticValve: {
    name: 'Aortic valve',
    kind: 'valve',
    description:
      'Three semilunar cusps at the exit of the left ventricle. The coronary arteries, which supply the heart muscle itself, branch off the aorta just above it. Its closure, with the pulmonary valve, produces the second heart sound (S2).',
    facts: [
      ['Cusps', 'Three, semilunar'],
      ['Between', 'Left ventricle and aorta'],
    ],
  },
  svc: {
    name: 'Superior vena cava',
    kind: 'deoxy',
    description:
      'Returns deoxygenated blood from the head, neck, arms and upper chest into the top of the right atrium.',
    facts: [
      ['Drains', 'Head, neck, arms, upper chest'],
      ['Empties into', 'Right atrium'],
    ],
  },
  ivc: {
    name: 'Inferior vena cava',
    kind: 'deoxy',
    description:
      'Returns deoxygenated blood from the abdomen, pelvis and legs into the bottom of the right atrium. It is the largest vein in the body.',
    facts: [
      ['Drains', 'Abdomen, pelvis, legs'],
      ['Empties into', 'Right atrium'],
    ],
  },
  pt: {
    name: 'Pulmonary trunk',
    kind: 'deoxy',
    description:
      'The single vessel leaving the right ventricle. It runs upward in front of the aorta, then divides under the aortic arch into the right and left pulmonary arteries.',
    facts: [
      ['Starts at', 'Right ventricle'],
      ['Divides into', 'Right and left pulmonary arteries'],
    ],
  },
  pa: {
    name: 'Pulmonary arteries',
    kind: 'deoxy',
    description:
      'Carry deoxygenated blood to the lungs, one to each lung. Together with the pulmonary trunk, they are the only arteries in the adult body that carry deoxygenated blood.',
    facts: [
      ['From', 'Pulmonary trunk'],
      ['To', 'Right and left lungs'],
    ],
  },
  pv: {
    name: 'Pulmonary veins',
    kind: 'oxy',
    description:
      'Usually four, two from each lung, carrying freshly oxygenated blood into the back of the left atrium. They are the only veins in the adult body that carry oxygenated blood.',
    facts: [
      ['From', 'Lungs'],
      ['Empties into', 'Left atrium'],
    ],
  },
  aorta: {
    name: 'Aorta',
    kind: 'oxy',
    description:
      'The largest artery in the body. It rises from the left ventricle (ascending aorta), curves backward and to the left over the heart (the arch, which gives off the branches to the head and arms), then runs down beside the spine (descending aorta).',
    facts: [
      ['Starts at', 'Left ventricle'],
      ['Supplies', 'Every organ in the body'],
    ],
  },
};

export const GROUPS: readonly (readonly [title: string, keys: readonly StructureKey[]])[] = [
  ['Chambers', ['ra', 'rv', 'la', 'lv']],
  ['Valves', ['tricuspid', 'pulmonaryValve', 'mitral', 'aorticValve']],
  ['Vessels', ['svc', 'ivc', 'pt', 'pa', 'pv', 'aorta']],
  ['Wall', ['septum']],
];

/** Structures hidden inside the heart, only labeled in cutaway and X-ray views. */
export const INTERIOR: ReadonlySet<StructureKey> = new Set<StructureKey>([
  'tricuspid',
  'mitral',
  'pulmonaryValve',
  'aorticValve',
  'septum',
]);
