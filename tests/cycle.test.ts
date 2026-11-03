import { describe, expect, it } from 'vitest';
import {
  CYCLE_MS,
  ELECTRICAL,
  EVENTS,
  LV_VOLUME,
  MECHANICAL,
  avValveOpenness,
  ecgMillivolts,
  lvVolumeMl,
  atrialScale,
  segmentAt,
  semilunarValveOpenness,
  wrap,
  type Segment,
} from '../src/heartbeat/cycle';

const samples = (step = 1): number[] =>
  Array.from({ length: Math.floor(CYCLE_MS / step) }, (_, i) => i * step);

const segment = <K extends string>(list: readonly Segment<K>[], key: K): Segment<K> => {
  const found = list.find((s) => s.key === key);
  if (!found) throw new Error(`Missing segment ${key}`);
  return found;
};

describe('timeline segments', () => {
  for (const [name, list] of [
    ['electrical', ELECTRICAL],
    ['mechanical', MECHANICAL],
  ] as const) {
    it(`${name} segments tile the whole cycle without gaps or overlaps`, () => {
      expect(list[0]?.start).toBe(0);
      expect(list[list.length - 1]?.end).toBe(CYCLE_MS);
      for (let i = 1; i < list.length; i++) {
        expect(list[i]?.start).toBe(list[i - 1]?.end);
      }
    });
  }

  it('segmentAt wraps times outside a single cycle', () => {
    expect(segmentAt(ELECTRICAL, 1232).key).toBe('qrs');
    expect(segmentAt(ELECTRICAL, -768).key).toBe('qrs');
    expect(wrap(2500)).toBe(500);
  });
});

describe('ECG waveform', () => {
  const peakTime = samples().reduce((best, t) =>
    ecgMillivolts(t) > ecgMillivolts(best) ? t : best,
  );

  it('peaks at the R wave inside the QRS complex', () => {
    const qrs = segment(ELECTRICAL, 'qrs');
    expect(peakTime).toBeGreaterThanOrEqual(qrs.start);
    expect(peakTime).toBeLessThan(qrs.end);
    expect(ecgMillivolts(peakTime)).toBeCloseTo(1.2, 1);
  });

  it('returns to baseline during the PR, ST and TP segments', () => {
    expect(Math.abs(ecgMillivolts(170))).toBeLessThan(0.02);
    expect(Math.abs(ecgMillivolts(330))).toBeLessThan(0.03);
    expect(Math.abs(ecgMillivolts(800))).toBeLessThan(0.01);
  });

  it('has intervals within normal adult ranges', () => {
    const p = segment(ELECTRICAL, 'p');
    const qrs = segment(ELECTRICAL, 'qrs');
    const t = segment(ELECTRICAL, 't');
    const prInterval = qrs.start - p.start;
    const qrsDuration = qrs.end - qrs.start;
    const qtInterval = t.end - qrs.start;
    expect(prInterval).toBeGreaterThanOrEqual(120);
    expect(prInterval).toBeLessThanOrEqual(200);
    expect(qrsDuration).toBeLessThanOrEqual(120);
    expect(qtInterval).toBeLessThan(440);
  });
});

describe('valves', () => {
  it('never has the AV and semilunar valves open at the same time', () => {
    for (const t of samples()) {
      expect(Math.min(avValveOpenness(t), semilunarValveOpenness(t))).toBe(0);
    }
  });

  it('keeps all four valves shut during both isovolumetric phases', () => {
    for (const key of ['isovolumetricContraction', 'isovolumetricRelaxation'] as const) {
      const phase = segment(MECHANICAL, key);
      for (let t = phase.start + 5; t < phase.end - 3; t++) {
        expect(avValveOpenness(t)).toBe(0);
        expect(semilunarValveOpenness(t)).toBe(0);
      }
    }
  });

  it('closes the AV valves (S1) after the QRS begins and the semilunar valves (S2) at the end of the T wave', () => {
    expect(EVENTS.s1).toBeGreaterThan(segment(ELECTRICAL, 'qrs').start);
    expect(Math.abs(EVENTS.s2 - segment(ELECTRICAL, 't').end)).toBeLessThanOrEqual(10);
  });
});

describe('left ventricular volume', () => {
  it('reaches end-diastolic and end-systolic volume', () => {
    const volumes = samples().map(lvVolumeMl);
    expect(Math.max(...volumes)).toBeCloseTo(LV_VOLUME.endDiastolicMl, 5);
    expect(Math.min(...volumes)).toBeCloseTo(LV_VOLUME.endSystolicMl, 5);
  });

  it('gives a normal ejection fraction', () => {
    const { endDiastolicMl: edv, endSystolicMl: esv } = LV_VOLUME;
    const ejectionFraction = (edv - esv) / edv;
    expect(ejectionFraction).toBeGreaterThanOrEqual(0.5);
    expect(ejectionFraction).toBeLessThanOrEqual(0.7);
  });

  it('stays constant while all valves are shut', () => {
    const contraction = segment(MECHANICAL, 'isovolumetricContraction');
    const relaxation = segment(MECHANICAL, 'isovolumetricRelaxation');
    for (let t = contraction.start; t < contraction.end; t++) expect(lvVolumeMl(t)).toBe(120);
    for (let t = relaxation.start; t < relaxation.end; t++) expect(lvVolumeMl(t)).toBe(50);
  });

  it('only falls during ejection', () => {
    const ejection = segment(MECHANICAL, 'ejection');
    for (let t = 1; t < CYCLE_MS; t++) {
      const falling = lvVolumeMl(t) < lvVolumeMl(t - 1) - 1e-9;
      if (falling) {
        expect(t).toBeGreaterThan(ejection.start);
        expect(t).toBeLessThanOrEqual(ejection.end);
      }
    }
  });
});

describe('continuity across beats', () => {
  it('has no jump in volume or atrial size from the end of one beat to the start of the next', () => {
    expect(Math.abs(lvVolumeMl(0) - lvVolumeMl(CYCLE_MS - 1e-6))).toBeLessThan(0.01);
    expect(Math.abs(atrialScale(0) - atrialScale(CYCLE_MS - 1e-6))).toBeLessThan(0.001);
  });
});
