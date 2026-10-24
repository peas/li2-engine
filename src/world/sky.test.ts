import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_SKY, Sky } from "./sky";

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe("Sky.setHora", () => {
  it("without setHora it is the fixed sky of the params (noon)", () => {
    const sky = new Sky({ ...DEFAULT_SKY });
    expect(sky.sun.intensity).toBeCloseTo(2.2);
    expect(sky.sunDir.y).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(30)));
    sky.setHora(0.5);
    expect(sky.params.zenith).toBe(DEFAULT_SKY.zenith);
    expect(sky.params.sunElevation).toBeCloseTo(DEFAULT_SKY.sunElevation);
    expect(sky.params.sunAzimuth).toBeCloseTo(DEFAULT_SKY.sunAzimuth);
    expect(sky.sun.intensity).toBeCloseTo(2.2);
  });

  it("midnight is darker than noon, but never black", () => {
    const sky = new Sky({ ...DEFAULT_SKY });
    sky.setHora(0.5);
    const dia = { zenith: lum(sky.uniforms.uZenith.value), fog: lum(sky.fog.color), light: sky.sun.intensity + sky.hemi.intensity };
    sky.setHora(0);
    const noite = { zenith: lum(sky.uniforms.uZenith.value), fog: lum(sky.fog.color), light: sky.sun.intensity + sky.hemi.intensity };
    expect(noite.zenith).toBeLessThan(dia.zenith * 0.5);
    expect(noite.fog).toBeLessThan(dia.fog);
    expect(noite.light).toBeLessThan(dia.light);
    expect(noite.light).toBeGreaterThan(1); // the child still sees
    expect(sky.noite).toBe(true);
    expect(sky.sunDir.y).toBeGreaterThan(0.3); // the light comes from the moon, above the horizon
  });

  it("sweeps the whole day without NaN, with the sun on the horizon at dawn and sunset", () => {
    const sky = new Sky({ ...DEFAULT_SKY });
    for (let i = 0; i <= 200; i++) {
      sky.setHora(i / 200);
      const vals = [sky.sun.intensity, sky.hemi.intensity, ...sky.sunDir.toArray(), ...sky.fog.color.toArray(),
        ...sky.uniforms.uZenith.value.toArray(), ...sky.uniforms.uHorizon.value.toArray(), sky.uniforms.uNight.value];
      for (const v of vals) expect(Number.isFinite(v)).toBe(true);
      expect(sky.sunDir.length()).toBeCloseTo(1);
    }
    sky.setHora(0.25);
    expect(sky.params.sunElevation).toBeCloseTo(0);
    sky.setHora(0.75);
    expect(sky.params.sunElevation).toBeCloseTo(0);
    sky.setHora(1.5); // wraps to noon
    expect(sky.hora).toBeCloseTo(0.5);
    sky.setHora(NaN); // ignored
    expect(sky.hora).toBeCloseTo(0.5);
  });

  it("overcast still works on top of the hour", () => {
    const sky = new Sky({ ...DEFAULT_SKY });
    sky.setHora(0.5);
    const clear = sky.sun.intensity;
    sky.overcast = 1;
    sky.apply();
    expect(sky.sun.intensity).toBeLessThan(clear);
  });
});
