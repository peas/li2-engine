/**
 * Where the audio files (music loops, pre-rendered voice lines and their index) are served from. The engine reads no
 * build variables: the game calls `configurarAudio` once at boot, typically with
 * `import.meta.env.VITE_AUDIO_BASE || \`${import.meta.env.BASE_URL}audio/\`` (public/audio/ in dev, the R2 bucket
 * when published, so the blog's repository never carries the mp3s). Default: "audio/" relative to the page.
 */
let base = "audio/";

export function configurarAudio(opts: { base: string }) {
  base = opts.base || "audio/";
}

/** URL of an audio file under the configured base (with or without the trailing slash). */
export function audioUrl(file: string): string {
  return base.endsWith("/") ? base + file : `${base}/${file}`;
}
