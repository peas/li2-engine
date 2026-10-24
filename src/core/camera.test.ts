import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_CAMERA, FollowCamera, type FollowTarget } from "./camera";
import type { Collider } from "./types";

const target = (pitch = 0): FollowTarget => ({ position: new THREE.Vector3(0, 0, 0), yaw: 0, pitch, speed: 0, cruiseSpeed: 7, maxSpeed: 10 });
const settle = (cam: FollowCamera, t: FollowTarget) => { for (let i = 0; i < 180; i++) cam.update(1 / 60, t); };
const make = (obst?: Collider) => new FollowCamera(new THREE.PerspectiveCamera(), { ...DEFAULT_CAMERA }, () => 0, undefined, obst);

/** A sphere of radius `r` at `c`: pushes points out, reports the push. */
const sphere = (c: THREE.Vector3, r: number): Collider => ({
  resolve(pos, radius) {
    const d = pos.distanceTo(c), min = r + radius;
    if (d >= min) return 0;
    const n = pos.clone().sub(c).normalize();
    pos.copy(c).addScaledVector(n, min);
    return min - d;
  },
});

describe("FollowCamera", () => {
  it("sits `distance` m behind and `height` m above at zero pitch (metres, no body length)", () => {
    const cam = make();
    settle(cam, target());
    const p = cam.camera.position;
    expect(p.z).toBeCloseTo(-DEFAULT_CAMERA.distance, 3); // yaw 0 faces +z: the camera is behind, at -z
    expect(p.y).toBeCloseTo(DEFAULT_CAMERA.height, 3);
  });

  it("the orbit pitch raises the camera and brings it in horizontally, still looking at the target", () => {
    const flat = make(), high = make();
    settle(flat, target(0));
    settle(high, target(0.6));
    expect(high.camera.position.y).toBeGreaterThan(flat.camera.position.y + 2);
    expect(Math.abs(high.camera.position.z)).toBeLessThan(Math.abs(flat.camera.position.z));
    const dir = new THREE.Vector3();
    high.camera.getWorldDirection(dir);
    expect(dir.y).toBeLessThan(-0.3); // looking down at her
  });

  it("the pitch is clamped to maxPitch", () => {
    const a = make(), b = make();
    settle(a, target(DEFAULT_CAMERA.maxPitch));
    settle(b, target(5));
    expect(b.camera.position.distanceTo(a.camera.position)).toBeLessThan(1e-6);
  });

  it("a wall between the target and the camera shortens the distance; it springs back once gone", () => {
    const wall = sphere(new THREE.Vector3(0, 1.5, -3), 1);
    const free = make(), blocked = make(wall);
    settle(free, target());
    settle(blocked, target());
    const pivot = new THREE.Vector3(0, DEFAULT_CAMERA.lookHeight, 0);
    expect(blocked.camera.position.distanceTo(pivot)).toBeLessThan(free.camera.position.distanceTo(pivot) * 0.7);
    blocked.obstaculos = undefined;
    settle(blocked, target());
    expect(blocked.camera.position.distanceTo(free.camera.position)).toBeLessThan(0.01);
  });

  it("a hill between the target and the camera also shortens it", () => {
    const hill = (x: number, z: number) => (z < -1.5 && z > -3.5 ? 4 : 0) + x * 0;
    const cam = new FollowCamera(new THREE.PerspectiveCamera(), { ...DEFAULT_CAMERA }, hill);
    settle(cam, target());
    expect(cam.camera.position.z).toBeGreaterThan(-2);
  });

  it("preset assigns only its keys, is a no-op when current, and throws on an unknown name", () => {
    const cam = make();
    cam.registrarPreset("perto", { distance: 2, height: 1 });
    cam.registrarPreset("longe", { distance: 12 });
    expect(cam.presetAtual).toBeNull();
    cam.preset("perto");
    expect(cam.presetAtual).toBe("perto");
    expect(cam.params).toMatchObject({ distance: 2, height: 1, lookHeight: DEFAULT_CAMERA.lookHeight });
    cam.params.distance = 7; // someone else touched it: calling the current preset again leaves it
    cam.preset("perto");
    expect(cam.params.distance).toBe(7);
    cam.preset("longe");
    expect(cam.params).toMatchObject({ distance: 12, height: 1 });
    expect(() => cam.preset("nada")).toThrow(/nada/);
    expect(cam.presetAtual).toBe("longe");
  });

  it("a preset is copied when registered (changing the source later does not change it)", () => {
    const cam = make(), fonte = { distance: 3 };
    cam.registrarPreset("a", fonte);
    fonte.distance = 9;
    cam.preset("a");
    expect(cam.params.distance).toBe(3);
  });
});
