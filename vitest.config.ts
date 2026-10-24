import { defineConfig } from "vitest/config";

// Logic tests only (store, save schema, catalogues, steering); what needs a GPU runs in the games' scripts/testar-*.mjs.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["vitest.setup.ts"],
  },
});
