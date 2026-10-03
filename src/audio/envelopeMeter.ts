/**
 * Post-gain loudness envelope for HUD animation (Night Pursuit voice box / power ladder).
 * Taps an output node with an AnalyserNode (no audio path change). getEnvelope() is cheap
 * enough to poll every animation frame: RMS of the last ~23 ms → dB → 0..1, with a fast
 * attack (~25 ms) and slower release (~180 ms) so segments breathe with the lope.
 */
export class EnvelopeMeter {
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private env = 0;
  private lastMs = 0;

  constructor(ctx: BaseAudioContext, source: AudioNode) {
    try {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0;
      source.connect(a);
      this.analyser = a;
      this.buf = new Float32Array(a.fftSize) as Float32Array<ArrayBuffer>;
    } catch {
      this.analyser = null;
    }
  }

  /** 0..1 — −54 dBFS → 0, −6 dBFS → 1 (perceptual dB mapping, smoothed). */
  read(): number {
    const a = this.analyser;
    const b = this.buf;
    if (!a || !b) return 0;
    a.getFloatTimeDomainData(b);
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    const rms = Math.sqrt(sum / b.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const target = Math.max(0, Math.min(1, (db + 54) / 48));
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this.lastMs ? Math.min(0.25, Math.max(0, (now - this.lastMs) / 1000)) : 1 / 60;
    this.lastMs = now;
    const tc = target > this.env ? 0.025 : 0.18;
    this.env += (target - this.env) * (1 - Math.exp(-dt / tc));
    return Number.isFinite(this.env) ? this.env : 0;
  }

  dispose(): void {
    try {
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    this.analyser = null;
    this.buf = null;
  }
}
