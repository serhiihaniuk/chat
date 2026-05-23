import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@side-chat/assistant-runtime": resolve(
        repoRoot,
        "packages/assistant-runtime/src/index.ts",
      ),
      "@side-chat/backend-core": resolve(
        repoRoot,
        "packages/backend-core/src/index.ts",
      ),
      "@side-chat/chat-client": resolve(
        repoRoot,
        "packages/chat-client/src/index.ts",
      ),
      "@side-chat/chat-protocol": resolve(
        repoRoot,
        "packages/chat-protocol/src/index.ts",
      ),
      "@side-chat/db": resolve(repoRoot, "packages/db/src/index.ts"),
      "@side-chat/host-bridge": resolve(
        repoRoot,
        "packages/host-bridge/src/index.ts",
      ),
      "@side-chat/side-chat-widget": resolve(
        repoRoot,
        "packages/side-chat-widget/src/index.ts",
      ),
      "@side-chat/testing": resolve(repoRoot, "packages/testing/src/index.ts"),
    },
  },
  test: {
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "test-harness/**/*.test.ts",
    ],
    passWithNoTests: true,
  },
});
