import { describe, expect, it } from "vitest";
import { PressLatch } from "./press";

describe("PressLatch", () => {
  it("a press read in a frame with no step reaches the next step, once", () => {
    const e = new PressLatch();
    e.note(true); // frame 1: pressed, zero steps
    e.note(false); // frame 2: the edge is gone from the input
    expect(e.take()).toBe(true); // the step of frame 2 still gets it
    expect(e.take()).toBe(false);
  });

  it("two frames of the same press count once; clear forgets it", () => {
    const e = new PressLatch();
    e.note(true);
    e.note(true);
    expect(e.take()).toBe(true);
    expect(e.take()).toBe(false);
    e.note(true);
    e.clear();
    expect(e.take()).toBe(false);
  });
});
