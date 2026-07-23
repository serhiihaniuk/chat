import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export const vitestResolveConfig = {
  alias: {
    "@side-chat/db/testing/client-tool-durability-test-support": resolve(
      repoRoot,
      "packages/db/src/testing/client-tool-durability-test-support.ts",
    ),
    "@side-chat/db": resolve(repoRoot, "packages/db/src/index.ts"),
    "@side-chat/host-bridge": resolve(repoRoot, "packages/host-bridge/src/index.ts"),
    "@side-chat/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
    "@side-chat/side-chat-widget": resolve(repoRoot, "packages/side-chat-widget/src/index.ts"),
  },
} as const;

export default defineConfig({
  resolve: vitestResolveConfig,
  test: {
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "test-harness/**/*.test.ts",
      "test-harness/**/*.test.tsx",
    ],
    exclude: [
      "packages/**/*.integration.test.ts",
      "apps/side-chat-service/src/adapters/persistence/**/*.integration.test.ts",
      "apps/side-chat-service/src/composition/lifecycle/process/**/*.integration.test.ts",
      "apps/side-chat-service/src/composition/route/testing-harness/**/*.integration.test.ts",
    ],
  },
});
