import { defineConfig } from "nitro";

// The workflow Nitro module compiles every `"use workflow"` / `"use step"`
// function reachable from the route graph into durable workflow bundles and
// serves the engine's `/.well-known/workflow/v1/*` endpoints. Those module
// routes are more specific than the catch-all, so the Hono app receives
// everything else.
export default defineConfig({
  modules: ["workflow/nitro"],
  routes: {
    "/**": "./src/index.ts",
  },
});
