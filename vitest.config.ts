import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@side-chat/agent-runtime": resolve(repoRoot, "packages/agent-runtime/src/index.ts"),
      "@side-chat/partner-ai-core": resolve(repoRoot, "packages/partner-ai-core/src/index.ts"),
      "@side-chat/chat-client": resolve(repoRoot, "packages/chat-client/src/index.ts"),
      "@side-chat/chat-protocol": resolve(repoRoot, "packages/chat-protocol/src/index.ts"),
      "@side-chat/db": resolve(repoRoot, "packages/db/src/index.ts"),
      "@side-chat/host-bridge": resolve(repoRoot, "packages/host-bridge/src/index.ts"),
      "@side-chat/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
      "@side-chat/side-chat-widget/testing": resolve(
        repoRoot,
        "packages/side-chat-widget/src/entities/chat/testing.ts",
      ),
      "@side-chat/side-chat-widget": resolve(repoRoot, "packages/side-chat-widget/src/index.ts"),
      "@side-chat/testing": resolve(repoRoot, "packages/testing/src/index.ts"),
    },
  },
  test: {
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "test-harness/**/*.test.ts",
      "test-harness/**/*.test.tsx",
    ],
    exclude: process.env["SIDECHAT_TEST_DATABASE_URL"] ? [] : ["packages/**/*.integration.test.ts"],
    passWithNoTests: true,
  },
});
