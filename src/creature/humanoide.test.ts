import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Humanoide, type Look } from "./humanoide";

const LOOK: Look = { height: 1.6, body: "#3d8de0", legs: "#2d3f6b", shoes: "#6b3e1f", hair: "#5a3519", skin: "#e8b48a", extra: "#e0362c", hairStyle: "rabo", adulto: false, bone: true };
const flat = () => 2;
const legsOf = (h: Humanoide) => (h as unknown as { legs: THREE.Group[] }).legs;

describe("Humanoide", () => {
  it("stands on the floor with the head near the top of its height", () => {
    const h = new Humanoide(LOOK, { heightAt: flat, x: 1, z: 1, escala: 1.5 });
    expect(h.height).toBeCloseTo(2.4);
    expect(h.group.position.y).toBe(2);
    expect(h.position.y).toBeGreaterThan(2 + h.height * 0.7);
    expect(h.position.y).toBeLessThan(2 + h.height);
  });

  it("swings the legs while walking and eases back to rest when it stops", () => {
    const h = new Humanoide(LOOK, { heightAt: flat, x: 0, z: 0 });
    let d = 0, maxSwing = 0;
    for (let i = 0; i < 120; i++) {
      d += 3.5 / 60;
      h.setMarcha(0.5, d);
      h.update(1 / 60, null, i / 60);
      maxSwing = Math.max(maxSwing, Math.abs(legsOf(h)[0].rotation.x));
    }
    expect(maxSwing).toBeGreaterThan(0.25);
    h.setMarcha(0, d);
    for (let i = 0; i < 120; i++) h.update(1 / 60, null, 2 + i / 60);
    expect(Math.abs(legsOf(h)[0].rotation.x)).toBeLessThan(0.01);
  });

  it("tucks the legs in a jump", () => {
    const h = new Humanoide(LOOK, { heightAt: flat, x: 0, z: 0 });
    h.setPulo(1);
    h.update(1 / 60, null, 0);
    expect(legsOf(h)[0].rotation.x).toBeLessThan(-0.5);
  });

  it("turns the body toward a target within faceRange, and rides and dismounts", () => {
    const h = new Humanoide(LOOK, { heightAt: flat, x: 0, z: 0, yaw: 0, acena: true });
    const alvo = new THREE.Vector3(3, 2, 0); // to its +x side: heading π/2
    for (let i = 0; i < 600; i++) h.update(1 / 60, alvo, i / 60);
    expect(h.group.rotation.y).toBeCloseTo(Math.PI / 2, 1);
    const scene = new THREE.Group();
    scene.add(h.group);
    const bone = new THREE.Object3D();
    bone.position.set(10, 5, 0);
    scene.add(bone);
    h.montar(bone, 1);
    expect(h.montado).toBe(true);
    expect(h.group.parent).toBe(bone);
    h.desmontar(flat, 4, 4, 1);
    expect(h.montado).toBe(false);
    expect(h.group.parent).toBe(scene);
    expect(h.group.position.y).toBe(2);
    expect(h.descanso).toBe(1);
  });
});
