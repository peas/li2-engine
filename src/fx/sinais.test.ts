import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Sinais } from "./sinais";

describe("Sinais (+1 labels)", () => {
  it("shows a label over the spot, rises and is gone after 1 s", () => {
    const box = document.createElement("div");
    const s = new Sinais(box);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    s.maisUm(new THREE.Vector3(0, 0, 0), "+1", "#fff");
    expect(box.children).toHaveLength(1);
    expect(box.textContent).toBe("+1");
    s.update(0.1, cam, 800, 600);
    const el = box.children[0] as HTMLElement;
    expect(el.style.transform).toContain("translate(400.0px");
    expect(Number(el.style.opacity)).toBeGreaterThan(0.9);
    s.update(0.95, cam, 800, 600);
    expect(s.count).toBe(0);
    expect(box.children).toHaveLength(0);
  });
});
