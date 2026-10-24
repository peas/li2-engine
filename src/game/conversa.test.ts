import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { conversar, type DepsConversa } from "./conversa";
import type { Fala, FimDoDialogo } from "./dialogo/fala";
import type { Npc } from "./npc";

const npc = (id: string, extra: Partial<Npc> = {}): Npc => ({
  id, nome: id, dialogo: `${id}-fala`, group: new THREE.Group(), position: new THREE.Vector3(),
  update() {}, canTalk: () => true, ...extra,
});

/** Dialogue names → one line each, recording what was played; quests stubbed per NPC. */
function deps(o: { falas?: Record<string, string[]>; oferta?: string[]; fim?: FimDoDialogo } = {}) {
  const tocados: string[] = [];
  const depois = vi.fn();
  const d: DepsConversa = {
    dialogo: { play: vi.fn(async (f: Fala[]) => { tocados.push(f[0].texto); return o.fim ?? "fim"; }) },
    missoes: {
      aoFalar: (id: string) => ({ falas: o.falas?.[id] ?? [], depois }),
      ofertaPara: (id: string) => (o.oferta?.includes(id) ? ({ id: "q" } as never) : null),
    },
    falas: (nome: string) => [{ quem: "", retrato: "", texto: nome }],
  };
  return { d, tocados, depois };
}

describe("conversar (engine)", () => {
  it("no quest: the NPC's own dialogue", async () => {
    const { d, tocados, depois } = deps();
    expect(await conversar(npc("vizinha"), d)).toBe("fim");
    expect(tocados).toEqual(["vizinha-fala"]);
    expect(depois).not.toHaveBeenCalled();
  });

  it("a quest giver greets with their own line first, then the offer; depois gets how it ended", async () => {
    const { d, tocados, depois } = deps({ falas: { padeiro: ["padeiro-oferta"] }, oferta: ["padeiro"] });
    await conversar(npc("padeiro"), d);
    expect(tocados).toEqual(["padeiro-fala", "padeiro-oferta"]);
    expect(depois).toHaveBeenCalledWith("fim");
  });

  it("a step waiting for them: only the quest lines; Esc stops the chain", async () => {
    const { d, tocados, depois } = deps({ falas: { pescador: ["a", "b"] }, fim: "pulado" });
    expect(await conversar(npc("pescador"), d)).toBe("pulado");
    expect(tocados).toEqual(["a"]);
    expect(depois).toHaveBeenCalledWith("pulado");
  });

  it("semMissoes (a sign): only its own dialogue, even with a quest line for it", async () => {
    const { d, tocados, depois } = deps({ falas: { placa: ["nunca"] }, oferta: ["placa"] });
    await conversar(npc("placa", { semMissoes: true }), d);
    expect(tocados).toEqual(["placa-fala"]);
    expect(depois).not.toHaveBeenCalled();
  });

  it("an NPC with its own conversar() runs it and nothing else", async () => {
    const { d, tocados } = deps({ falas: { cafe: ["x"] } });
    const proprio = vi.fn(async () => "pulado" as const);
    expect(await conversar(npc("cafe", { conversar: proprio, semMissoes: true }), d)).toBe("pulado");
    expect(proprio).toHaveBeenCalledTimes(1);
    expect(tocados).toEqual([]);
  });
});
