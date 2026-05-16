import { createPostgresSideChatPersistence } from "@side-chat/db";

import { fakeModelAdapter } from "#adapters/ai/fake-model.js";
import { openAiModelAdapter } from "#adapters/ai/openai-model.js";
import { createPlaywrightWorkbenchReportPort } from "#adapters/reports/playwright-report.js";
import { createWorkbenchTools } from "#adapters/workbench/workbench-tools-adapter.js";
import type { StreamChatDeps } from "#application/stream-chat.js";
import { parseSideChatEnv } from "../config.js";
import { createMemoryHostSurfaceState } from "./host-surface-state.js";
import {
  createMemoryConversationRepository,
  createMemoryUsageRepository,
  unconfiguredModelAdapter,
} from "./memory-repositories.js";
import { supportedModels } from "./model-config.js";
import { createDefaultPageContext } from "./page-context.js";
import { reportStore } from "./report-store.js";

/**
 * Composition root for the Hono app. This is where concrete adapters are chosen
 * from environment configuration and assembled behind application ports.
 */
export const createDefaultDeps = (): StreamChatDeps => {
  const env = parseSideChatEnv();
  const persistence = env.DATABASE_URL
    ? createPostgresSideChatPersistence(env.DATABASE_URL)
    : undefined;
  const hostSurfaceState = createMemoryHostSurfaceState();
  const allowlist = env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS
    ? env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
  const blocklist = env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS
    ? env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    model: env.USE_FAKE_MODEL
      ? fakeModelAdapter
      : env.SIDE_CHAT_MODEL_ADAPTER === "openai" && env.OPENAI_API_KEY
        ? openAiModelAdapter
        : unconfiguredModelAdapter,
    pageContext: createDefaultPageContext(),
    workbenchTools: createWorkbenchTools(env.DATABASE_URL, hostSurfaceState),
    workbenchReports: createPlaywrightWorkbenchReportPort(reportStore),
    hostSurfaceState,
    conversations:
      persistence?.conversations ?? createMemoryConversationRepository(),
    usage: persistence?.usage ?? createMemoryUsageRepository(),
    auth: {
      async authorize(workspaceId) {
        if (allowlist && allowlist.length > 0) {
          return allowlist.includes(workspaceId);
        }
        if (blocklist && blocklist.includes(workspaceId)) return false;
        return true;
      },
    },
    rateLimit: {
      async check(_workspaceId, _userId) {
        return env.SIDE_CHAT_RATE_LIMITING_ENABLED;
      },
    },
    billing: {
      async allow(_workspaceId) {
        return env.SIDE_CHAT_BILLING_ENABLED;
      },
    },
    observability: {
      lifecycle() {},
      counter() {},
      async span(_name, run) {
        return run();
      },
    },
    config: {
      models() {
        return supportedModels;
      },
      defaultUserId() {
        return env.SIDE_CHAT_DEFAULT_USER_ID;
      },
    },
  };
};
