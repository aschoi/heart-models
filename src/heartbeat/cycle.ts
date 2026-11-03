/**
 * One cardiac cycle at a resting 60 bpm, expressed as pure functions of time.
 *
 * Every visual in the heartbeat model (ECG trace, chamber size, valve state,
 * depolarization glow, conduction pulse and readout) is derived from these
 * functions, so they stay in sync by construction. Values are representative
 * textbook figures for a healthy adult at rest, not patient data.
 */

export const CYCLE_MS = 1000;

/** Key mechanical moments within the cycle, in milliseconds. */
export const EVENTS = {
  sinusFires: 40,
  qrsOnset: 200,
  /** Tricuspid and mitral valves close: first heart sound. */
  s1: 220,
  semilunarOpen: 290,
  /** Pulmonary and aortic valves close: second heart sound. */
  s2: 560,
  avValvesOpen: 640,
} as const;

export const LV_VOLUME = { endDiastolicMl: 120, endSystolicMl: 50 } as const;

export interface Segment<K extends string> {
  start: number;
  end: number;
  key: K;
  name: string;
  summary: string;
}

export type ElectricalKey = 'tp' | 'p' | 'pr' | 'qrs' | 'st' | 't';
export type MechanicalKey =
  | 'diastasis'
  | 'atrialSystole'
  | 'isovolumetricContraction'
  | 'ejection'
  | 'isovolumetricRelaxation'
  | 'rapidFilling';

const REST: Omit<Segment<ElectricalKey>, 'start' | 'end'> = {
  key: 'tp',
  name: 'Electrical rest',
  summary:
    'The heart muscle is fully repolarized and waiting for the next signal from the sinoatrial (SA) node. On the ECG this is the flat TP segment.',
};

export const ELECTRICAL: readonly Segment<ElectricalKey>[] = [
  { start: 0, end: 40, ...REST },
  {
    start: 40,
    end: 140,
    key: 'p',
    name: 'P wave',
    summary:
      'The SA node fires and the signal spreads across both atria, depolarizing them. That spreading charge is what draws the small, rounded P wave.',
  },
  {
    start: 140,
    end: 200,
    key: 'pr',
    name: 'PR segment',
    summary:
      'The signal is held in the AV node for about a tenth of a second so the atria can finish emptying. The bundle of His is conducting during this time, but it is too small to register, so the line is flat.',
  },
  {
    start: 200,
    end: 280,
    key: 'qrs',
    name: 'QRS complex',
    summary:
      'The signal races down the bundle branches and Purkinje fibers and depolarizes both ventricles at once. The atria repolarize at the same moment, but that signal is hidden inside the much larger QRS.',
  },
  {
    start: 280,
    end: 380,
    key: 'st',
    name: 'ST segment',
    summary:
      'The ventricles are fully depolarized, so no voltage difference is measured and the line returns to baseline. This is the plateau phase of the ventricular action potential, while the ventricles contract.',
  },
  {
    start: 380,
    end: 560,
    key: 't',
    name: 'T wave',
    summary:
      'The ventricles repolarize, resetting electrically so they can respond to the next beat. The end of the T wave lines up closely with the aortic valve closing.',
  },
  { start: 560, end: CYCLE_MS, ...REST },
];

const DIASTASIS: Omit<Segment<MechanicalKey>, 'start' | 'end'> = {
  key: 'diastasis',
  name: 'Slow filling (diastasis)',
  summary:
    'The tricuspid and mitral valves are open, and blood trickles from the veins through the atria into the relaxed ventricles.',
};

export const MECHANICAL: readonly Segment<MechanicalKey>[] = [
  { start: 0, end: 100, ...DIASTASIS },
  {
    start: 100,
    end: EVENTS.s1,
    key: 'atrialSystole',
    name: 'Atrial contraction',
    summary:
      'The atria squeeze and top up the ventricles with the last part of their filling, often called the atrial kick. It begins just after the P wave.',
  },
  {
    start: EVENTS.s1,
    end: EVENTS.semilunarOpen,
    key: 'isovolumetricContraction',
    name: 'Isovolumetric contraction',
    summary:
      'The ventricles start to contract. Their pressure rises above the atria and snaps the tricuspid and mitral valves shut, making the first heart sound (S1). All four valves are closed, so volume does not change yet.',
  },
  {
    start: EVENTS.semilunarOpen,
    end: EVENTS.s2,
    key: 'ejection',
    name: 'Ventricular ejection',
    summary:
      'Ventricular pressure exceeds pressure in the pulmonary artery and aorta. The pulmonary and aortic valves open and blood is pumped out, about 70 mL from the left ventricle at rest.',
  },
  {
    start: EVENTS.s2,
    end: EVENTS.avValvesOpen,
    key: 'isovolumetricRelaxation',
    name: 'Isovolumetric relaxation',
    summary:
      'The ventricles relax. Their pressure falls below the arteries, the pulmonary and aortic valves close (the second heart sound, S2), and all four valves are shut while pressure keeps dropping.',
  },
  {
    start: EVENTS.avValvesOpen,
    end: 800,
    key: 'rapidFilling',
    name: 'Rapid filling',
    summary:
      'Ventricular pressure falls below atrial pressure, the tricuspid and mitral valves open, and blood that collected in the atria rushes into the ventricles.',
  },
  { start: 800, end: CYCLE_MS, ...DIASTASIS },
];

/** Time within the current cycle, in [0, CYCLE_MS). */
export function wrap(t: number): number {
  return ((t % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
}

export function segmentAt<S extends { start: number; end: number }>(
  segments: readonly S[],
  t: number,
): S {
  const time = wrap(t);
  const found = segments.find((s) => time >= s.start && time < s.end);
  if (!found) throw new Error(`No segment covers t=${time}`);
  return found;
}

const gaussian = (t: number, center: number, width: number, amplitude: number): number => {
  const x = (t - center) / width;
  return amplitude * Math.exp(-x * x);
};

/** Idealized lead II voltage in millivolts, built from one Gaussian per wave. */
export function ecgMillivolts(t: number): number {
  const time = wrap(t);
  return (
    gaussian(time, 90, 22, 0.15) + // P
    gaussian(time, 212, 7, -0.12) + // Q
    gaussian(time, 232, 9, 1.2) + // R
    gaussian(time, 254, 9, -0.28) + // S
    gaussian(time, 470, 48, 0.32) // T
  );
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smoothstep = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x);

/** Left ventricular volume in millilitres. */
export function lvVolumeMl(t: number): number {
  const time = wrap(t);
  const { endDiastolicMl: edv, endSystolicMl: esv } = LV_VOLUME;
  if (time < 100) return lerp(110, 112, time / 100);
  if (time < EVENTS.s1) return lerp(112, edv, smoothstep((time - 100) / (EVENTS.s1 - 100)));
  if (time < EVENTS.semilunarOpen) return edv;
  if (time < EVENTS.s2) {
    const x = (time - EVENTS.semilunarOpen) / (EVENTS.s2 - EVENTS.semilunarOpen);
    return edv - (edv - esv) * easeOut(x);
  }
  if (time < EVENTS.avValvesOpen) return esv;
  if (time < 800) return esv + (105 - esv) * easeOut((time - EVENTS.avValvesOpen) / 160);
  return lerp(105, 110, (time - 800) / 200);
}

/** Relative atrial size: contracts with atrial systole, fills while the AV valves are shut. */
export function atrialScale(t: number): number {
  const time = wrap(t);
  if (time < 100) return lerp(0.97, 0.98, time / 100);
  if (time < EVENTS.s1) return lerp(0.98, 0.84, smoothstep((time - 100) / (EVENTS.s1 - 100)));
  if (time < EVENTS.avValvesOpen) {
    return lerp(0.84, 1.06, smoothstep((time - EVENTS.s1) / (EVENTS.avValvesOpen - EVENTS.s1)));
  }
  if (time < 800) return lerp(1.06, 0.95, smoothstep((time - EVENTS.avValvesOpen) / 160));
  return lerp(0.95, 0.97, (time - 800) / 200);
}

/** Relative ventricular size, following left ventricular volume. */
export function ventricularScale(t: number): number {
  const { endDiastolicMl: edv, endSystolicMl: esv } = LV_VOLUME;
  return 0.84 + 0.16 * ((lvVolumeMl(t) - esv) / (edv - esv));
}

/** Openness of the tricuspid and mitral valves, from 0 (shut) to 1 (open). */
export function avValveOpenness(t: number): number {
  const time = wrap(t);
  if (time < EVENTS.s1 - 10) return 1;
  if (time < EVENTS.s1 + 5) return 1 - (time - (EVENTS.s1 - 10)) / 15;
  if (time < EVENTS.avValvesOpen) return 0;
  if (time < EVENTS.avValvesOpen + 20) return (time - EVENTS.avValvesOpen) / 20;
  return 1;
}

/** Openness of the pulmonary and aortic valves, from 0 (shut) to 1 (open). */
export function semilunarValveOpenness(t: number): number {
  const time = wrap(t);
  if (time < EVENTS.semilunarOpen) return 0;
  if (time < EVENTS.semilunarOpen + 15) return (time - EVENTS.semilunarOpen) / 15;
  if (time < EVENTS.s2 - 15) return 1;
  if (time < EVENTS.s2 + 2) return 1 - (time - (EVENTS.s2 - 15)) / 17;
  return 0;
}

/** How depolarized the atria are, from 0 to 1. */
export function atrialActivation(t: number): number {
  const time = wrap(t);
  if (time < 40) return 0;
  if (time < 140) return smoothstep((time - 40) / 100);
  if (time < 220) return 1;
  return 1 - smoothstep((time - 220) / 80);
}

/** How depolarized the ventricles are, from 0 to 1. */
export function ventricularActivation(t: number): number {
  const time = wrap(t);
  if (time < 200) return 0;
  if (time < 280) return smoothstep((time - 200) / 80);
  if (time < 380) return 1;
  return 1 - smoothstep((time - 380) / 180);
}

/** Conduction pathway timing: when the impulse travels each part. */
export const CONDUCTION_TIMING = {
  saToAv: [40, 100],
  avDelay: [100, 170],
  his: [170, 200],
  bundleBranches: [200, 235],
  purkinje: [235, 275],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Brightness of a conduction segment active over [start, end): 1 while the
 * impulse passes, then fading back to 0 over `fade` milliseconds.
 */
export function pulseLevel(t: number, start: number, end: number, fade = 260): number {
  const since = wrap(t - start);
  const duration = end - start;
  return since <= duration ? 1 : Math.max(0, 1 - (since - duration) / fade);
}
