// Lets `node scripts/missoes-md.ts` load the engine's own source, whose relative imports have no extension
// (`../../core/math`, as Vite and tsc expect). Node's type stripping needs the file name, so a resolve hook retries a
// relative specifier that was not found with `.ts` and then `/index.ts`. Use: node --import ./scripts/ts-sem-extensao.mjs <script.ts>
import { registerHooks } from "node:module";

registerHooks({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto);
    } catch (erro) {
      if (erro?.code !== "ERR_MODULE_NOT_FOUND" || !/^\.\.?\//.test(especificador) || /\.[cm]?[jt]sx?$/.test(especificador)) throw erro;
      try {
        return proximo(`${especificador}.ts`, contexto);
      } catch {
        return proximo(`${especificador}/index.ts`, contexto);
      }
    }
  },
});
