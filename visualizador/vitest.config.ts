import { defineConfig } from "vitest/config";

// The loader and the graph are pure Node/TS; the page is checked in a real Chromium by scripts/capturar.mjs.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
