import type * as THREE from "three";
import type GUI from "lil-gui";
import { clamp, smoothstep } from "../core/math";

export interface NatureParams {
  enabled: boolean;
  volume: number;
  /** 0..1: how often birds sing. */
  birds: number;
}

/** What the world around the player sounds like this frame (the game computes it). */
export interface NatureFrame {
  position: THREE.Vector3;
  /** Height above the ground (m). */
  altitude: number;
  grounded: boolean;
  /** Metres to the nearest shore of a lake, river or sea (0 = in or on the water). */
  waterDistance: number;
  /** 0..1 how deep in the woods. */
  forest: number;
  /** 0..1 rain level (Weather.rainLevel). */
  rain: number;
  /** Inside a cave, a house, under a roof: no water or birds, a low hum, rain muffled. */
  enclosed: boolean;
}

/** Time constant of every gain change (s). */
const RAMP = 0.3;
/** Peak gains of each layer, before the master. */
const LEVEL = { water: 0.35, rain: 0.55, enclosed: 0.06, bird: 0.07, drip: 0.05 };
const WATER = { range: 120, altLow: 30, altHigh: 60 };
const BIRDS = { minGap: 1, maxGap: 6, highFrom: 40, highTo: 80 };

/**
 * Nature ambience, all synthesized (no files): water at the shore (low-passed noise with a slow swell), rain
 * (band-passed noise + soft drips), a very quiet hum indoors, and birds (short chirp phrases, one oscillator per phrase that stops
 * and disconnects itself). One looped noise buffer feeds the three noise layers. `start()` from a user gesture.
 */
export class Nature {
  readonly params: NatureParams = { enabled: true, volume: 0.5, birds: 0.6 };
  private ctx?: AudioContext;
  private master?: GainNode;
  private water?: GainNode;
  private rain?: GainNode;
  private enclosed?: GainNode;
  private birdBus?: GainNode;
  private nextBird = 2;
  private nextDrip = 1;
  private chirps = 0;
  private birdRate = 0;

  setContext(ctx: AudioContext) {
    if (!this.ctx) this.ctx = ctx;
  }

  start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC() as AudioContext;
      }
      if (!this.master) this.build(this.ctx);
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    } catch {
      this.master = undefined; // no WebAudio: silent
    }
  }

  private build(ctx: AudioContext) {
    // 4 s of pink noise (Paul Kellet's filter), looped: same recipe as the wind
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

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const layer = (type: BiquadFilterType, freq: number, q: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g);
      return { f, g };
    };

    // water: low-passed noise whose level swells with two slow LFOs (lapping), then the distance gain
    const water = layer("lowpass", 420, 0.7);
    const lap = ctx.createGain();
    lap.gain.value = 0.6;
    for (const [hz, depth] of [[0.21, 0.25], [0.53, 0.15]]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const d = ctx.createGain();
      d.gain.value = depth;
      lfo.connect(d).connect(lap.gain);
      lfo.start();
    }
    water.g.connect(lap).connect(master);

    const rain = layer("bandpass", 1500, 0.5);
    rain.g.connect(master);
    const enclosed = layer("lowpass", 140, 0.9);
    enclosed.g.connect(master);
    const birdBus = ctx.createGain();
    birdBus.gain.value = 1;
    birdBus.connect(master);
    src.start();
    Object.assign(this, { ctx, master, water: water.g, rain: rain.g, enclosed: enclosed.g, birdBus });
  }

  update(dt: number, f: NatureFrame) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.water || !this.rain || !this.enclosed) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(this.params.enabled ? this.params.volume : 0, t, RAMP);
    if (!this.params.enabled || ctx.state !== "running") return;

    const rain = clamp(f.rain, 0, 1);
    const shore = 1 - smoothstep(0, WATER.range, f.waterDistance);
    const low = 1 - smoothstep(WATER.altLow, WATER.altHigh, f.altitude);
    this.water.gain.setTargetAtTime(f.enclosed ? 0 : LEVEL.water * shore * low, t, RAMP);
    this.rain.gain.setTargetAtTime(LEVEL.rain * rain * (f.enclosed ? 0.3 : 1), t, RAMP);
    this.enclosed.gain.setTargetAtTime(f.enclosed ? LEVEL.enclosed : 0, t, RAMP);

    // birds: a phrase every 1-6 s at rate 1; more in the woods and near the ground, fewer high up or in the rain
    const high = smoothstep(BIRDS.highFrom, BIRDS.highTo, f.altitude);
    const nearGround = f.grounded ? 1 : 1 - high;
    this.birdRate = f.enclosed ? 0
      : this.params.birds * (0.35 + 1.2 * clamp(f.forest, 0, 1) + 0.4 * nearGround) * (1 - 0.85 * high) * (1 - 0.8 * rain);
    if ((this.nextBird -= dt * this.birdRate) <= 0) {
      this.nextBird = BIRDS.minGap + (BIRDS.maxGap - BIRDS.minGap) * Math.random();
      this.chirp(ctx, t);
    }
    if (rain > 0.05 && (this.nextDrip -= dt * rain) <= 0) {
      this.nextDrip = 0.4 + Math.random() * 2;
      this.drip(ctx, t);
    }
  }

  /** One bird phrase: 2-4 notes on a single oscillator, each a quick sweep up or down, panned at random. */
  private chirp(ctx: AudioContext, t0: number) {
    if (!this.birdBus) return;
    const osc = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    osc.type = Math.random() < 0.6 ? "sine" : "triangle";
    pan.pan.value = Math.random() * 1.6 - 0.8;
    g.gain.value = 0;
    osc.connect(g).connect(pan).connect(this.birdBus);
    const notes = 2 + Math.floor(Math.random() * 3), base = 2200 + Math.random() * 2000, up = Math.random() < 0.5;
    const peak = LEVEL.bird * (0.6 + 0.4 * Math.random());
    let t = t0 + 0.02;
    for (let i = 0; i < notes; i++) {
      const len = 0.06 + Math.random() * 0.09, from = base * (0.9 + 0.2 * Math.random()), to = from * (up ? 1.35 : 0.7);
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + len);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.012);
      g.gain.linearRampToValueAtTime(0, t + len);
      t += len + 0.04 + Math.random() * 0.08;
    }
    this.play(osc, [g, pan], t0, t);
  }

  /** A soft drop: short sine falling in pitch. */
  private drip(ctx: AudioContext, t0: number) {
    if (!this.master) return;
    const osc = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    const f = 1400 + Math.random() * 1400, t = t0 + 0.01;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(LEVEL.drip * (0.5 + Math.random() * 0.5), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(pan).connect(this.master);
    this.play(osc, [g, pan], t0, t + 0.1);
  }

  private play(osc: OscillatorNode, chain: AudioNode[], from: number, to: number) {
    osc.onended = () => {
      osc.disconnect();
      for (const n of chain) n.disconnect();
    };
    osc.start(from);
    osc.stop(to + 0.02);
    this.chirps++;
  }

  /** Current values, for tests and the console. */
  get state() {
    return this.ctx && this.master
      ? {
          context: this.ctx.state,
          master: this.master.gain.value,
          water: this.water?.gain.value ?? 0,
          rain: this.rain?.gain.value ?? 0,
          enclosed: this.enclosed?.gain.value ?? 0,
          birdRate: this.birdRate,
          sounds: this.chirps, // birds + drips played so far
        }
      : null;
  }

  addGui(folder: GUI) {
    folder.add(this.params, "enabled").name("sons da natureza");
    folder.add(this.params, "volume", 0, 1, 0.05).name("volume da natureza");
    folder.add(this.params, "birds", 0, 1, 0.05).name("passarinhos");
  }
}
