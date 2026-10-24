import * as THREE from "three";

/**
 * How a creature looks, by slots (generic version of the Dragão's `appearance.ts`): the colour of each **part** (a part
 * = a list of material names of the model; the first one is the canonical name our own models use, the rest aliases
 * for third-party models) and, per **slot**, which variant sits there (`null` = nothing). Slots are just ids here: the
 * game builds what goes in them (the Dragão's accessories on the dragon's bones stay in the Dragão). Saved as JSON.
 */
export type Aparencia<Partes extends string, Slots extends string = never> = Record<Partes, string> & Record<Slots, string | null>;

export interface OpcoesAparencia<Partes extends string, Slots extends string> {
  /** Part → material names it recolours. */
  partes: Record<Partes, readonly string[]>;
  /** The slot ids (variants are the game's). */
  slots?: readonly Slots[];
  /** The look of a new creature (every part and every slot). */
  padrao: NoInfer<Aparencia<Partes, Slots>>;
}

export interface Aparencias<Partes extends string, Slots extends string> {
  readonly PARTES: readonly Partes[];
  readonly SLOTS: readonly Slots[];
  readonly padrao: Aparencia<Partes, Slots>;
  /** Which part a material name belongs to (undefined: none, the material is left alone). */
  parteDe(nomeMaterial: string): Partes | undefined;
  /** Recolours every material of `root` by part (colours only; materials of unknown names are left alone). */
  aplicar(root: THREE.Object3D, a: Pick<Aparencia<Partes, Slots>, Partes>): void;
  /** `a` over the default: missing parts/slots get the default, unknown keys and non-string colours are dropped. */
  completar(a: Partial<Record<string, unknown>> | null | undefined): Aparencia<Partes, Slots>;
}

export function criarAparencia<Partes extends string, Slots extends string = never>(o: OpcoesAparencia<Partes, Slots>): Aparencias<Partes, Slots> {
  const PARTES = Object.keys(o.partes) as Partes[];
  const SLOTS = [...(o.slots ?? [])];
  const porMaterial = new Map<string, Partes>();
  for (const p of PARTES) for (const nome of o.partes[p]) {
    if (porMaterial.has(nome)) throw new Error(`aparência: o material "${nome}" está em duas partes (${porMaterial.get(nome)} e ${p})`);
    porMaterial.set(nome, p);
  }
  for (const k of [...PARTES, ...SLOTS]) if (!(k in o.padrao)) throw new Error(`aparência: falta "${k}" no padrão`);
  const parteDe = (nome: string) => porMaterial.get(nome);
  return {
    PARTES, SLOTS, padrao: o.padrao, parteDe,
    aplicar(root, a) {
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          const p = parteDe(m.name);
          if (p && "color" in m && (m as THREE.MeshStandardMaterial).color instanceof THREE.Color) (m as THREE.MeshStandardMaterial).color.set(a[p]);
        }
      });
    },
    completar(a) {
      const r = { ...o.padrao } as Record<string, string | null>;
      for (const p of PARTES) if (typeof a?.[p] === "string") r[p] = a[p] as string;
      for (const s of SLOTS) if (a && s in a && (typeof a[s] === "string" || a[s] === null)) r[s] = a[s] as string | null;
      return r as Aparencia<Partes, Slots>;
    },
  };
}
