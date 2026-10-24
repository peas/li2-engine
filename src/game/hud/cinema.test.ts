import { describe, expect, it } from "vitest";
import { criarModoCinema } from "./cinema";

describe("criarModoCinema", () => {
  it("hides the elements as a block and shows them back; an element's own display survives underneath", () => {
    const a = document.createElement("div"), b = document.createElement("div");
    document.body.append(a, b);
    b.style.display = "none"; // a strip that manages its own display
    const cinema = criarModoCinema(() => [a, b, null]);
    cinema(true);
    expect(getComputedStyle(a).display).toBe("none");
    b.style.display = ""; // it redraws itself during the scene: still hidden
    expect(getComputedStyle(b).display).toBe("none");
    cinema(false);
    expect(getComputedStyle(a).display).not.toBe("none");
    expect(getComputedStyle(b).display).not.toBe("none");
    expect(a.className).toBe("");
  });
});
