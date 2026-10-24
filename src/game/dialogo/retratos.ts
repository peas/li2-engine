/**
 * Round portraits for the dialogue box, drawn with the 2D canvas API (no image files). Every drawing works in a
 * 100×100 space centred at (50, 50), clipped to a disc and scaled to `size`. The game registers its characters
 * (`registrarRetrato("vovo", g => ...)`); an unknown key is a grey disc with its first letter. Cached by key and size.
 */
export type DesenhoRetrato = (g: CanvasRenderingContext2D) => void;

const cache = new Map<string, HTMLCanvasElement>();
const DESENHOS = new Map<string, DesenhoRetrato>();

export function registrarRetrato(key: string, draw: DesenhoRetrato) {
  DESENHOS.set(key, draw);
  for (const k of [...cache.keys()]) if (k.startsWith(`${key}@`)) cache.delete(k);
}

export const temRetrato = (key: string) => DESENHOS.has(key);

export function retrato(key: string, size = 220): HTMLCanvasElement {
  const id = `${key}@${size}`;
  const hit = cache.get(id);
  if (hit) return copia(hit);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c; // no 2D canvas (tests without one): an empty portrait
  g.scale(size / 100, size / 100);
  g.beginPath();
  g.arc(50, 50, 50, 0, Math.PI * 2);
  g.clip();
  (DESENHOS.get(key) ?? letra(key))(g);
  cache.set(id, c);
  return copia(c);
}

/** A canvas can sit in one place of the DOM only: hand out copies of the cached drawing. */
function copia(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")?.drawImage(src, 0, 0);
  return c;
}

function letra(key: string): DesenhoRetrato {
  return (g) => {
    g.fillStyle = "#7a7a86";
    g.fillRect(0, 0, 100, 100);
    g.fillStyle = "#ffffff";
    g.font = "bold 52px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText((key.trim()[0] ?? "?").toUpperCase(), 50, 54);
  };
}
