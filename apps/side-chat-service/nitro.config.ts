import { defineConfig } from "nitro";

// The workflow Nitro module compiles every `"use workflow"` / `"use step"`
// function reachable from the route graph into durable workflow bundles and
// serves the engine's `/.well-known/workflow/v1/*` endpoints. Those module
// routes are more specific than the catch-all, so the Hono app receives
// everything else. The compatibility suite supplies its own entry override
// through the programmatic builder; this production config never names it.
const config = {
  preset: "node_middleware",
  modules: ["workflow/nitro"],
  workflow: { dirs: ["src/workflows/production"] },
  routes: {
    "/**": "./src/index.ts",
  },
};

export default defineConfig(config);
