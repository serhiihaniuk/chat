import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build, copyPublicAssets, createNitro, prepare, prerender } from "nitro/builder";

import { assertProductionBundleUsesPostgresWorld } from "../apps/side-chat-service/src/adapters/http/testing/production-bundle-guard.ts";

const serviceRoot = fileURLToPath(new URL("../apps/side-chat-service", import.meta.url));

// Workflow's Nitro module resolves its World while compiling. Keep this in the
// production command so a developer cannot accidentally create a local-world
// artifact and then point Side Chat persistence at Postgres at runtime.
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";

const nitro = await createNitro({
  rootDir: serviceRoot,
  dev: false,
});

try {
  await prepare(nitro);
  await copyPublicAssets(nitro);
  await prerender(nitro);
  await build(nitro);
  assertProductionBundleUsesPostgresWorld(resolve(serviceRoot, ".output"));
} finally {
  await nitro.close();
}
