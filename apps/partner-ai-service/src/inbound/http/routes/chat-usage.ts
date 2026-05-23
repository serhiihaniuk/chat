import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { SidechatRepositories } from "@side-chat/db";
import type { Hono } from "hono";

import type { AuthContextVariables } from "../middleware/auth-context.js";
import { requireContextAuth } from "./types.js";

export const registerChatUsageRoute = (
  app: Hono<AuthContextVariables>,
  repositories: SidechatRepositories,
) => {
  app.get("/usage", (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      workspaceId: authContext.workspaceId,
      ...usageSummary(repositories),
    });
  });
};

const usageSummary = (
  repositories: SidechatRepositories,
): {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
} => {
  if (!hasSnapshot(repositories)) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const snapshot = repositories.snapshot();
  return snapshot.usageRecords.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
};

const hasSnapshot = (
  repositories: SidechatRepositories,
): repositories is SidechatRepositories & {
  readonly snapshot: () => {
    readonly usageRecords: readonly {
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly totalTokens: number;
    }[];
  };
} => "snapshot" in repositories && typeof repositories.snapshot === "function";
