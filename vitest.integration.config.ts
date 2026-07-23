import { defineConfig } from "vitest/config";

import { vitestResolveConfig } from "./vitest.config.js";

/** Explicit opt-in lane for tests that own disposable persistence or process fixtures. */
export default defineConfig({
  resolve: vitestResolveConfig,
  test: {
    exclude: [],
    fileParallelism: false,
    include: ["apps/**/*.integration.test.ts", "packages/**/*.integration.test.ts"],
  },
});
