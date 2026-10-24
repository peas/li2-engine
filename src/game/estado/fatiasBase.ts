import { diaConta, diasReaisDesde, faltaParaODia } from "../tempo";
import { CAMPOS_BASE, type MissaoEstado, type SaveBase } from "./base";
import type { Fatia } from "./fatias";
import type { AcoesBase, Estado } from "./store";

/**
 * The engine's slices (fields in base.ts, actions here): every game lists them first. `carregarSave` and `zerar` are
 * the store's own (store.ts), not a slice's.
 */
type FatiaBase<K extends keyof AcoesBase<SaveBase>> = Fatia<SaveBase, Pick<AcoesBase<SaveBase>, K>, Estado<SaveBase>>;

const somar = (bag: Record<string, number>, id: string, qtd: number) => {
  const next = { ...bag, [id]: (bag[id] ?? 0) + qtd };
  if (next[id] <= 0) delete next[id];
  return next;
};

const dia: FatiaBase<"tick" | "dormir" | "voltar"> = {
  nome: "dia",
  ...CAMPOS_BASE.dia,
  acoes: (set, get, { eventos, salvar, minutosPorDia }) => ({
    tick(dt) {
      if (dt <= 0) return;
      set((s) => ({ segundosHoje: s.segundosHoje + dt }));
    },

    dormir() {
      const seg = get().segundosHoje;
      const novoDia = diaConta(seg, minutosPorDia);
      const faltam = faltaParaODia(seg, minutosPorDia);
      if (novoDia) set((s) => ({ dia: s.dia + 1, segundosHoje: 0 }));
      eventos.emit("dormiu", get().dia, novoDia);
      salvar("dormiu");
      return { novoDia, faltam };
    },

    voltar(agora = Date.now()) {
      const dias = diasReaisDesde(get().ultimaVez, agora);
      if (dias > 0) set((s) => ({ dia: s.dia + dias, segundosHoje: 0 }));
      eventos.emit("voltou", dias, get().dia);
      return dias;
    },
  }),
};

const inventario: FatiaBase<"pegarItem" | "tirarItem" | "usarItem"> = {
  nome: "inventario",
  ...CAMPOS_BASE.inventario,
  acoes: (set, get, { eventos }) => ({
    pegarItem(id, qtd = 1) {
      if (qtd <= 0) return;
      set((s) => ({ inventario: somar(s.inventario, id, qtd) }));
      eventos.emit("pegouItem", id, qtd);
    },

    tirarItem(id, qtd = 1) {
      if ((get().inventario[id] ?? 0) < qtd) return false;
      set((s) => ({ inventario: somar(s.inventario, id, -qtd) }));
      return true;
    },

    usarItem(id, qtd = 1) {
      if (!get().tirarItem(id, qtd)) return false;
      eventos.emit("usouItem", id, qtd);
      return true;
    },
  }),
};

const missoes: FatiaBase<"missao" | "missaoIniciar" | "missaoAtualizar" | "missaoZerar"> = {
  nome: "missoes",
  ...CAMPOS_BASE.missoes,
  acoes: (set, get, { eventos, salvar }) => ({
    missao(id) {
      return get().missoes[id];
    },

    missaoIniciar(id) {
      if (get().missoes[id]) return;
      set((s) => ({ missoes: { ...s.missoes, [id]: { passo: 0, contadores: {}, concluida: false } } }));
      eventos.emit("missaoIniciada", id);
    },

    missaoAtualizar(id, mudanca) {
      const atual = get().missoes[id];
      if (!atual) return;
      const next: MissaoEstado = { ...atual, ...mudanca, contadores: { ...atual.contadores, ...(mudanca.contadores ?? {}) } };
      set((s) => ({ missoes: { ...s.missoes, [id]: next } }));
      if (next.concluida && !atual.concluida) {
        eventos.emit("missaoConcluida", id);
        salvar("missao");
      }
    },

    missaoZerar(id) {
      set((s) => {
        const missoes = { ...s.missoes };
        delete missoes[id];
        return { missoes };
      });
    },
  }),
};

const dicas: FatiaBase<"dicaNova"> = {
  nome: "dicas",
  ...CAMPOS_BASE.dicas,
  acoes: (set, get) => ({
    dicaNova(id) {
      if (get().dicas.includes(id)) return false;
      set((s) => ({ dicas: [...s.dicas, id] }));
      return true;
    },
  }),
};

const cenas: FatiaBase<"cenaVista" | "verCena"> = {
  nome: "cenas",
  ...CAMPOS_BASE.cenas,
  acoes: (set, get) => ({
    cenaVista(id) {
      return get().cenasVistas.includes(id);
    },

    verCena(id) {
      if (get().cenasVistas.includes(id)) return;
      set((s) => ({ cenasVistas: [...s.cenasVistas, id] }));
    },
  }),
};

const novidades: FatiaBase<"verNovidades"> = {
  nome: "novidades",
  ...CAMPOS_BASE.novidades,
  acoes: (set, get, { salvar }) => ({
    verNovidades(versao) {
      if (get().ultimaNovidadeVista >= versao) return;
      set({ ultimaNovidadeVista: versao });
      salvar("novidades");
    },
  }),
};

/** The play clock (`segundosHoje`, `ultimaVez`): fields only; the day's actions (slice `dia`) move it. */
const relogio: FatiaBase<never> = { nome: "relogio", ...CAMPOS_BASE.relogio };

/** The engine's slices, in save order (`SaveBaseSchema`'s order). */
export const FATIAS_BASE: readonly Fatia[] = [dia, inventario, missoes, dicas, cenas, novidades, relogio];
