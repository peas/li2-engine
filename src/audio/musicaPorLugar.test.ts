import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escolherFaixa, MusicaPorLugar } from "./musicaPorLugar";

/** A fake AudioContext (a clock and gains that take the last value set) and a fake <audio> (src, play, pause). */
class Param {
  value = 0;
  setTargetAtTime(v: number) { this.value = v; }
  cancelScheduledValues() {}
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
}
class Ctx {
  currentTime = 0;
  state = "running";
  destination = {};
  resume() { return Promise.resolve(); }
  createGain() { return { gain: new Param(), connect() {} }; }
  createMediaElementSource() { return { connect() {} }; }
}
class FakeAudio {
  static todos: FakeAudio[] = [];
  private _src = "";
  get src() { return this._src; }
  set src(v: string) { this._src = v; this.currentTime = 0; this.ended = false; }
  paused = true;
  ended = false;
  duration = 100;
  currentTime = 0;
  crossOrigin = "";
  preload = "";
  error = null;
  constructor() { FakeAudio.todos.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
}

const FAIXAS = { a: { arquivo: "a.mp3", titulo: "A" }, b: { arquivo: "b.mp3" }, c: { arquivo: "https://x/c.mp3" } };

describe("escolherFaixa", () => {
  it("never repeats the last track when there is another, and picks by the random number", () => {
    expect(escolherFaixa(["a", "b"], "a", () => 0.9)).toBe("b");
    expect(escolherFaixa(["a"], "a")).toBe("a");
    expect(escolherFaixa(["a", "b", "c"], undefined, () => 0.5)).toBe("b");
  });
});

describe("MusicaPorLugar", () => {
  beforeEach(() => { FakeAudio.todos = []; vi.stubGlobal("Audio", FakeAudio); });
  afterEach(() => vi.unstubAllGlobals());

  const montar = () => {
    const m = new MusicaPorLugar({ faixas: FAIXAS, enabled: true });
    const ctx = new Ctx();
    m.setContext(ctx as unknown as AudioContext);
    return { m, ctx };
  };

  it("fetches nothing while disabled, then plays a track that fits the place", () => {
    const m = new MusicaPorLugar({ faixas: FAIXAS });
    m.setContext(new Ctx() as unknown as AudioContext);
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(FakeAudio.todos).toHaveLength(0);
    m.params.enabled = true;
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(FakeAudio.todos).toHaveLength(2);
    expect(["a", "b"]).toContain(m.state!.faixa);
    expect(m.state!.lugar).toBe("campo");
  });

  it("keeps a track that also fits the new place, swaps one that does not", () => {
    const { m } = montar();
    m.update(1 / 60, "campo", ["a"]);
    m.update(1 / 60, "vila", ["a", "b"]);
    expect(m.state!.faixa).toBe("a");
    expect(m.state!.trocas).toBe(1);
    m.update(1 / 60, "praia", ["c"]);
    expect(m.state!.faixa).toBe("c");
    expect(FakeAudio.todos.find((a) => !a.paused && a.src === "https://x/c.mp3")).toBeTruthy(); // absolute URLs as they are
    expect(m.state!.trocas).toBe(2);
  });

  it("near the end of a track the next one that fits comes in, never the same one twice", () => {
    const { m, ctx } = montar();
    m.update(1 / 60, "campo", ["a", "b"]);
    const primeira = m.state!.faixa;
    const tocando = FakeAudio.todos.find((a) => !a.paused)!;
    tocando.currentTime = 98.5;
    ctx.currentTime = 1;
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(m.state!.faixa).not.toBe(primeira);
    // the old deck is paused once its fade is over
    ctx.currentTime = 5;
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(FakeAudio.todos.filter((a) => !a.paused)).toHaveLength(1);
  });

  it("disabling fades out and pauses; enabling resumes the same track", () => {
    const { m } = montar();
    m.update(1 / 60, "campo", ["a", "b"]);
    const faixa = m.state!.faixa;
    m.params.enabled = false;
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(FakeAudio.todos.every((a) => a.paused)).toBe(true);
    m.params.enabled = true;
    m.update(1 / 60, "campo", ["a", "b"]);
    expect(m.state!.faixa).toBe(faixa);
    expect(FakeAudio.todos.some((a) => !a.paused)).toBe(true);
  });
});
