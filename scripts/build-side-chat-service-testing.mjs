import { fileURLToPath } from "node:url";

import { build, copyPublicAssets, createNitro, prepare, prerender } from "nitro/builder";

const serviceRoot = fileURLToPath(new URL("../apps/side-chat-service", import.meta.url));

// The compatibility artifact is deliberately a different route graph. Keeping
// this override outside production config makes scripted providers unreachable
// from a normal Nitro build instead of relying on a runtime mode switch.
const nitro = await createNitro({
  rootDir: serviceRoot,
  dev: false,
  routes: { "/**": "./src/composition/route/testing-entry.ts" },
  workflow: { dirs: ["src/workflows/testing"] },
});

try {
  await prepare(nitro);
  await copyPublicAssets(nitro);
  await prerender(nitro);
  await build(nitro);
} finally {
  await nitro.close();
}
