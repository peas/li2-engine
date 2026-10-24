/**
 * The screens' CSS (classes `tl-`), injected once by montarTelas. Sizes for a child: body 20 px, titles 28 px, targets
 * ≥ 64 px. A game adds its own rules (its extra screens) in its own stylesheet, reusing these classes.
 */
export const CSS = `
.tl-fundo { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(10, 6, 24, .45);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; font-size: 20px; }
.tl-caixa { width: min(680px, 92vw); max-height: 86vh; box-sizing: border-box; display: flex; flex-direction: column;
  padding: 18px 20px 14px; background: rgba(26, 20, 48, .92); border: 2px solid rgba(255, 255, 255, .85);
  border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, .45), inset 0 0 0 4px rgba(255, 255, 255, .06);
  animation: tl-entra .18s ease; }
@keyframes tl-entra { from { opacity: 0; transform: translateY(10px) scale(.98); } }
.tl-topo { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.tl-titulo { font-size: 28px; font-weight: 800; color: #ffd23f; letter-spacing: .02em; margin-right: auto; }
.tl-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 20px; font-weight: 700; padding: 4px 12px;
  border-radius: 999px; background: rgba(255, 255, 255, .1); }
.tl-desc { margin-top: 10px; min-height: 28px; font-size: 21px; text-align: center; color: #ffe9a8; }
.tl-dica { margin-top: 8px; font-size: 17px; text-align: center; opacity: .7; }
.tl-secao { font-size: 21px; font-weight: 800; margin: 14px 2px 8px; color: #cfc4ff; }
.tl-secao:first-child { margin-top: 0; }
.tl-grade { display: grid; gap: 10px; }
.tl-ico { display: inline-flex; flex: none; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .4)); }
.tl-ico svg { display: block; }
[data-nav] { outline: none; }
.tl-cartao { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; padding: 10px 8px; min-height: 128px; border-radius: 14px; cursor: pointer;
  text-align: center; background: rgba(255, 255, 255, .07); border: 3px solid transparent;
  transition: background-color .15s ease, border-color .15s ease, transform .1s ease, opacity .15s ease; }
.tl-linha { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 14px; padding: 10px 16px;
  min-height: 64px; border-radius: 14px; cursor: pointer; background: rgba(255, 255, 255, .07);
  border: 3px solid transparent; transition: background-color .15s ease, border-color .15s ease; }
.tl-cartao:focus, .tl-linha:focus, .tl-botao:focus { border-color: #ffd23f; background: rgba(255, 210, 63, .16); }
.tl-cartao:active, .tl-botao:active { transform: scale(.97); }
.tl-nome { font-size: 21px; font-weight: 700; line-height: 1.15; }
.tl-qtd { position: absolute; top: 6px; right: 8px; font-size: 20px; font-weight: 800; }
.tl-mais { font-size: 18px; font-weight: 700; color: #9be37a; }
.tl-preco { display: inline-flex; align-items: center; gap: 4px; font-size: 20px; font-weight: 800; color: #ffd23f; }
.tl-estado { font-size: 18px; opacity: .85; }
.tl-cinza { opacity: .5; }
.tl-cinza:focus { opacity: .8; }
.tl-nham { animation: tl-nham .35s ease; }
@keyframes tl-nham { 40% { background: rgba(127, 211, 90, .55); transform: scale(1.04); } }
.tl-nao { animation: tl-nao .35s ease; }
@keyframes tl-nao { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
.tl-voa { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); font-size: 26px; font-weight: 900;
  color: #9be37a; pointer-events: none; animation: tl-voa .7s ease forwards; }
@keyframes tl-voa { to { opacity: 0; transform: translate(-50%, -28px); } }
.tl-vazio { font-size: 22px; line-height: 1.5; text-align: center; padding: 24px 12px; opacity: .9; }
.tl-botao { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 64px; min-width: 64px; padding: 6px 16px; border-radius: 12px; cursor: pointer; font-size: 20px; font-weight: 700;
  background: rgba(255, 255, 255, .09); border: 3px solid transparent; }
.tl-botao.tl-on { background: rgba(127, 211, 90, .3); border-color: rgba(155, 227, 122, .9); }
.tl-botao.tl-on:focus { border-color: #ffd23f; }
.tl-lista { display: flex; flex-direction: column; gap: 8px; }
.tl-missao { flex-direction: column; align-items: stretch; gap: 6px; }
.tl-missao-topo { display: flex; align-items: center; gap: 10px; }
.tl-status { font-size: 17px; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, .14); }
.tl-status-ativa { background: #ffd23f; color: #2b1d3a; }
.tl-status-feita { background: rgba(127, 211, 90, .45); }
.tl-passo { font-size: 19px; opacity: .9; padding-left: 8px; }
.tl-passo.tl-feito { opacity: .55; text-decoration: line-through; }
.tl-quem { font-size: 17px; opacity: .75; }
.tl-ajuda-secao { padding: 10px 14px; border-radius: 14px; border: 3px solid transparent; margin-bottom: 8px;
  background: rgba(255, 255, 255, .05); }
.tl-ajuda-secao:focus { border-color: #ffd23f; }
.tl-ajuda-secao h3 { margin: 0 0 8px; font-size: 24px; color: #ffd23f; }
.tl-ajuda-linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 0; font-size: 20px; }
.tl-ajuda-linha b { color: #cfc4ff; }
.tl-ajuda-linha > span { flex: 1 1 260px; }
.tl-k1 { color: #ffd23f; font-weight: 800; }
.tl-k2 { color: #8fd8ff; font-weight: 800; }
kbd.tl-tecla { display: inline-block; min-width: 26px; padding: 3px 10px; border-radius: 8px; text-align: center;
  font: 700 19px system-ui, sans-serif; color: #2b1d3a; background: #f4efff; box-shadow: 0 3px 0 #9a8fc0; }
`;
