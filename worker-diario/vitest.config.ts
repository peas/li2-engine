import { defineConfig } from "vitest/config";

// Own config: without it vitest climbs to the engine's (happy-dom + its setup file). The validation is pure Node.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });
