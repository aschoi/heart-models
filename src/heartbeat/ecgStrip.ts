import {
  CYCLE_MS,
  ELECTRICAL,
  EVENTS,
  LV_VOLUME,
  ecgMillivolts,
  lvVolumeMl,
  segmentAt,
} from './cycle';

const VOLUME_HEIGHT = 92;
const BAND_HEIGHT = 22;
const GAP = 8;
const AXIS_HEIGHT = 20;
/** Volume axis range in mL. */
const VOLUME_RANGE = [40, 130] as const;

const TOKEN_NAMES = [
  'paper',
  'grid-minor',
  'grid-major',
  'trace',
  'paper-ink',
  'systole',
  'diastole',
  'vol-bg',
  'oxy',
  'cursor',
  'tint',
  'ink',
  'muted',
  'line',
] as const;
type Token = (typeof TOKEN_NAMES)[number];

interface Layout {
  width: number;
  height: number;
  cycles: number;
  /** Size of one small ECG square (40 ms by 0.1 mV) in CSS pixels. */
  square: number;
  ecgHeight: number;
  baseline: number;
  bandY: number;
  volumeY: number;
  axisY: number;
  dpr: number;
  spanMs: number;
}

/**
 * ECG paper at standard scale (25 mm/s, 10 mm/mV) with a sweeping time cursor,
 * a systole/diastole band and a left ventricular volume curve underneath.
 * The static layers are drawn once to an offscreen canvas; each frame only
 * adds the cursor and the highlighted segment.
 */
export class EcgStrip {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background = document.createElement('canvas');
  private readonly bg: CanvasRenderingContext2D;
  private layout: Layout | null = null;
  private tokens = {} as Record<Token, string>;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    const bg = this.background.getContext('2d');
    if (!ctx || !bg) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.bg = bg;
    this.readTokens();
  }

  get spanMs(): number {
    return this.layout?.spanMs ?? CYCLE_MS * 3;
  }

  readTokens(): void {
    const style = getComputedStyle(document.documentElement);
    for (const name of TOKEN_NAMES) this.tokens[name] = style.getPropertyValue(`--${name}`).trim();
    if (this.layout) this.drawBackground();
  }

  resize(): void {
    const width = this.canvas.clientWidth;
    if (!width) return;
    const cycles = width < 640 ? 2 : 3;
    const square = width / (cycles * 25);
    const ecgHeight = Math.round(square * 17);
    const bandY = ecgHeight + GAP;
    const volumeY = bandY + BAND_HEIGHT + GAP;
    const axisY = volumeY + VOLUME_HEIGHT;
    const height = axisY + AXIS_HEIGHT;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.height = `${height}px`;
    for (const c of [this.canvas, this.background]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    this.layout = {
      width,
      height,
      cycles,
      square,
      ecgHeight,
      baseline: square * 13,
      bandY,
      volumeY,
      axisY,
      dpr,
      spanMs: cycles * CYCLE_MS,
    };
    this.drawBackground();
  }

  /** Time on the strip (0 to spanMs) under a client x coordinate. */
  timeAtClientX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const u = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
    return u * this.spanMs;
  }

  draw(simTimeMs: number): void {
    const L = this.layout;
    if (!L) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.background, 0, 0);
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);

    const stripTime = ((simTimeMs % L.spanMs) + L.spanMs) % L.spanMs;
    const t = stripTime % CYCLE_MS;
    const cycleStart = stripTime - t;
    const segment = segmentAt(ELECTRICAL, t);
    const x0 = this.x(cycleStart + segment.start);
    c.fillStyle = this.tokens.tint;
    c.fillRect(x0, 0, this.x(cycleStart + segment.end) - x0, L.ecgHeight);

    const x = this.x(stripTime);
    c.strokeStyle = this.tokens.cursor;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, L.axisY);
    c.stroke();
    this.dot(x, this.yEcg(ecgMillivolts(t)), 4.5, this.tokens.cursor);
    this.dot(x, this.yVolume(lvVolumeMl(t)), 4, this.tokens.oxy);
  }

  private x(t: number): number {
    const L = this.layout;
    return L ? (t / L.spanMs) * L.width : 0;
  }

  private yEcg(mv: number): number {
    const L = this.layout;
    return L ? L.baseline - mv * L.square * 10 : 0;
  }

  private yVolume(ml: number): number {
    const L = this.layout;
    if (!L) return 0;
    const [lo, hi] = VOLUME_RANGE;
    return L.volumeY + 10 + (1 - (ml - lo) / (hi - lo)) * (VOLUME_HEIGHT - 20);
  }

  private dot(x: number, y: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawBackground(): void {
    const L = this.layout;
    if (!L) return;
    const c = this.bg;
    const tk = this.tokens;
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    c.clearRect(0, 0, L.width, L.height);

    // ECG paper: small squares every 40 ms / 0.1 mV, bold lines every 5 squares.
    c.fillStyle = tk.paper;
    c.fillRect(0, 0, L.width, L.ecgHeight);
    c.lineWidth = 1;
    for (let i = 0; i * L.square <= L.width + 0.5; i++) {
      const x = Math.round(i * L.square) + 0.5;
      c.strokeStyle = i % 5 === 0 ? tk['grid-major'] : tk['grid-minor'];
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, L.ecgHeight);
      c.stroke();
    }
    for (let j = 0; L.ecgHeight - j * L.square >= -0.5; j++) {
      const y = Math.round(L.ecgHeight - j * L.square) + 0.5;
      c.strokeStyle = j % 5 === 0 ? tk['grid-major'] : tk['grid-minor'];
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(L.width, y);
      c.stroke();
    }

    c.strokeStyle = tk.trace;
    c.lineWidth = 1.7;
    c.lineJoin = 'round';
    this.plot(c, (t) => this.yEcg(ecgMillivolts(t)));

    c.fillStyle = tk['paper-ink'];
    c.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
    c.textBaseline = 'middle';
    for (let k = 0; k < L.cycles; k++) {
      const o = k * CYCLE_MS;
      c.textAlign = 'center';
      c.fillText('P', this.x(o + 90), this.yEcg(0.15) - 11);
      c.fillText('R', this.x(o + 232), this.yEcg(1.2) - 10);
      c.fillText('T', this.x(o + 470), this.yEcg(0.32) - 11);
      c.textAlign = 'right';
      c.fillText('Q', this.x(o + 210) - 3, this.yEcg(-0.12) + 11);
      c.textAlign = 'left';
      c.fillText('S', this.x(o + 256) + 3, this.yEcg(-0.28) + 11);
    }

    // Systole / diastole band.
    c.font = "500 11px 'IBM Plex Sans', system-ui, sans-serif";
    const systoleWidth = this.x(EVENTS.s2) - this.x(EVENTS.s1);
    const diastoleWidth = this.x(CYCLE_MS + EVENTS.s1) - this.x(EVENTS.s2);
    for (let k = 0; k < L.cycles; k++) {
      const o = k * CYCLE_MS;
      c.fillStyle = tk.diastole;
      c.fillRect(this.x(o), L.bandY, this.x(o + CYCLE_MS) - this.x(o), BAND_HEIGHT);
      c.fillStyle = tk.systole;
      c.fillRect(this.x(o + EVENTS.s1), L.bandY, systoleWidth, BAND_HEIGHT);
      c.fillStyle = tk.ink;
      c.textAlign = 'center';
      if (systoleWidth > 52) c.fillText('Systole', this.x(o + 390), L.bandY + BAND_HEIGHT / 2);
      if (diastoleWidth > 60) c.fillText('Diastole', this.x(o + 780), L.bandY + BAND_HEIGHT / 2);
    }

    // Left ventricular volume panel.
    c.fillStyle = tk['vol-bg'];
    c.fillRect(0, L.volumeY, L.width, VOLUME_HEIGHT);
    c.strokeStyle = tk.line;
    c.setLineDash([3, 4]);
    for (const ml of [LV_VOLUME.endSystolicMl, LV_VOLUME.endDiastolicMl]) {
      const y = Math.round(this.yVolume(ml)) + 0.5;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(L.width, y);
      c.stroke();
    }
    for (let k = 0; k < L.cycles; k++) {
      for (const t of [EVENTS.s1, EVENTS.s2]) {
        const x = Math.round(this.x(k * CYCLE_MS + t)) + 0.5;
        c.beginPath();
        c.moveTo(x, L.bandY + BAND_HEIGHT);
        c.lineTo(x, L.axisY);
        c.stroke();
      }
    }
    c.setLineDash([]);
    c.fillStyle = tk.muted;
    c.textAlign = 'left';
    c.font = "400 10.5px 'IBM Plex Mono', ui-monospace, monospace";
    c.fillText(`${LV_VOLUME.endDiastolicMl} mL`, 6, this.yVolume(LV_VOLUME.endDiastolicMl) - 8);
    c.fillText(`${LV_VOLUME.endSystolicMl} mL`, 6, this.yVolume(LV_VOLUME.endSystolicMl) + 9);
    for (let k = 0; k < L.cycles; k++) {
      c.fillText('S1', this.x(k * CYCLE_MS + EVENTS.s1) + 4, L.volumeY + 9);
      c.fillText('S2', this.x(k * CYCLE_MS + EVENTS.s2) + 4, L.volumeY + 9);
    }
    c.strokeStyle = tk.oxy;
    c.lineWidth = 2;
    this.plot(c, (t) => this.yVolume(lvVolumeMl(t)));

    // Time axis.
    c.strokeStyle = tk.line;
    c.lineWidth = 1;
    c.fillStyle = tk.muted;
    c.textBaseline = 'top';
    for (let t = 0; t <= L.spanMs; t += 200) {
      const x = Math.round(this.x(t)) + 0.5;
      const major = t % CYCLE_MS === 0;
      c.beginPath();
      c.moveTo(x, L.axisY);
      c.lineTo(x, L.axisY + (major ? 7 : 4));
      c.stroke();
      if (major) {
        c.textAlign = t === 0 ? 'left' : t === L.spanMs ? 'right' : 'center';
        c.fillText(`${t / 1000} s`, t === 0 ? x + 1 : x, L.axisY + 8);
      }
    }
  }

  private plot(c: CanvasRenderingContext2D, y: (cycleTime: number) => number): void {
    const L = this.layout;
    if (!L) return;
    c.beginPath();
    for (let t = 0; t <= L.spanMs; t += 2) {
      const px = this.x(t);
      const py = y(t % CYCLE_MS);
      if (t === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  }
}
