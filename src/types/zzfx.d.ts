// zzfx ships no types; this is the surface the game uses (src/audio/sfx.ts).
declare module "zzfx" {
  /** Play a sound from its ~20 parameters (the ZzFX sound designer exports them). Returns the source node. */
  export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode;
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    play(...params: (number | undefined)[]): AudioBufferSourceNode;
    buildSamples(...params: (number | undefined)[]): number[];
    playSamples(...samples: number[][]): AudioBufferSourceNode;
  };
}
