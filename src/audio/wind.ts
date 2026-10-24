import type GUI from "lil-gui";

export interface WindParams {
  enabled: boolean;
  volume: number;
}

/** Ramp time constant (s) for every change: smooth, no clicks. */
const RAMP = 0.25;

/**
 * Wind that grows with speed: filtered noise from WebAudio, no audio file. Pink noise loops through a
 * band-pass whose centre and gain rise with speed; a slow LFO wobbles the centre (gusts) and another the
 * gain. `start()` must be called from a user gesture (click/keydown). Silently does nothing without WebAudio.
 */
export class WindSound {
  readonly params: WindParams = { enabled: true, volume: 0.5 };
  private ctx?: AudioContext;
  private filter?: BiquadFilterNode;
  private gain?: GainNode;
  private master?: GainNode;
  private gustDepth?: GainNode;
  private suspended = false;

  start() {
    try {
      if (!this.ctx) this.build();
      if (this.params.enabled && this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = undefined; // no WebAudio: the game stays silent
    }
  }

  private build() {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    // 4 s of pink noise (Paul Kellet's filter), looped
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 300;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const master = ctx.createGain();
    master.gain.value = this.params.volume;

    // gusts: a slow LFO on the filter centre (depth follows speed) and a slower one on the gain
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 60;
    lfo.connect(gustDepth).connect(filter.frequency);
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.07;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.25; // ±25% around the speed gain (modulates the master's input gain below)
    const swellGain = ctx.createGain();
    swellGain.gain.value = 1;
    swell.connect(swellDepth).connect(swellGain.gain);

    src.connect(filter).connect(gain).connect(swellGain).connect(master).connect(ctx.destination);
    src.start(); lfo.start(); swell.start();
    Object.assign(this, { ctx, filter, gain, master, gustDepth });
  }

  /** `speedRatio` = speed / maxSpeed (0..1); `grounded` mutes it to a breeze. */
  update(_dt: number, speedRatio: number, grounded: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.filter || !this.gain || !this.master || !this.gustDepth) return;
    const t = ctx.currentTime;
    if (!this.params.enabled) {
      if (!this.suspended) {
        this.suspended = true;
        this.master.gain.setTargetAtTime(0, t, 0.15);
        setTimeout(() => { if (!this.params.enabled) void ctx.suspend().catch(() => {}); }, 800);
      }
      return;
    }
    if (this.suspended) {
      this.suspended = false;
      void ctx.resume().catch(() => {});
    }
    const r = Math.min(Math.max(speedRatio, 0), 1);
    const air = grounded ? 0 : r;
    // cruise (~0.4): ~800 Hz, gain 0.17; top speed: ~2 kHz, gain 0.75; grounded: 220 Hz breeze
    const freq = grounded ? 220 : 250 + 1750 * air ** 1.3;
    const level = grounded ? 0.04 : 0.05 + 0.7 * air * air;
    this.filter.frequency.setTargetAtTime(freq, t, RAMP);
    this.filter.Q.setTargetAtTime(0.7 + 1.3 * air, t, RAMP); // a bit of whistle when fast
    this.gustDepth.gain.setTargetAtTime(freq * 0.25, t, RAMP);
    this.gain.gain.setTargetAtTime(level, t, RAMP);
    this.master.gain.setTargetAtTime(this.params.volume, t, RAMP);
  }

  /** The AudioContext (after `start`), shared with the music and the nature sounds. */
  get context() {
    return this.ctx;
  }

  /** Current values, for tests and the console. */
  get state() {
    return this.ctx && this.filter && this.gain
      ? { context: this.ctx.state, frequency: this.filter.frequency.value, Q: this.filter.Q.value, gain: this.gain.gain.value, master: this.master?.gain.value }
      : null;
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("som do vento");
    folder.add(this.params, "volume", 0, 1, 0.05).name("volume");
  }
}
