import { createNoise2D } from "simplex-noise";
import { mulberry32 } from "../core/math";

/** Seeded 2D simplex noise plus fractal Brownian motion: the raw material every island composes its heights from. */
export interface Ruido {
  /** Simplex noise, -1..1. */
  noise2D: (x: number, z: number) => number;
  /** Sum of `octaves` noise layers, each half the amplitude and twice the frequency of the last, normalised to -1..1. */
  fbm: (x: number, z: number, octaves: number) => number;
}

/** The same seed gives the same world on every load. */
export function criarRuido(seed: number): Ruido {
  const noise2D = createNoise2D(mulberry32(seed));
  const fbm = (x: number, z: number, octaves: number) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2D(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
  return { noise2D, fbm };
}
