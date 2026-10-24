/**
 * A key edge that must reach the simulation, not the frame. `Input.justPressed` lasts one frame (until `endFrame`),
 * but a frame may run zero fixed steps (the accumulator had less than one step in it): a press read in such a frame
 * and handed to the step as a plain boolean is overwritten by the next frame and lost. This latch keeps it until a
 * step takes it (found in As Três Ilhas on 23/10/2026: one E tap in ~60 did nothing; the same wiring is what the
 * Dragão gets when its E moves into the step).
 */
export class PressLatch {
  private pending = false;

  /** Once per frame, with this frame's edge: a press stays remembered until `take()`. */
  note(pressedNow: boolean) {
    if (pressedNow) this.pending = true;
  }

  /** Once per step: true at most once per press. */
  take(): boolean {
    const p = this.pending;
    this.pending = false;
    return p;
  }

  /** Forget a remembered press (something opened before any step could take it). */
  clear() {
    this.pending = false;
  }
}
