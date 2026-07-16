import { describe, expect, it, vi } from "vitest";
import {
  type SidechatRepositories,
  toAssistantTurnId,
  toClientToolDispatchId,
  toToolCallId,
  toWorkspaceId,
} from "@side-chat/db";

import { CLIENT_TOOL_DISPATCH_LOOKUP } from "#application/ports/turn/tools/client-tool-dispatch-store";
import {
  assistantTurnRecord,
  fakeRepositories,
  NOW,
} from "#testing/persistence/postgres-turn-state-test-support";

import { createPostgresClientToolDispatchStore } from "./client-tool-dispatches.js";

const AUTH = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "now",
} as const;

describe("Postgres client-tool dispatch ownership", () => {
  it("hides a durable dispatch from a tab presenting the wrong capability", async () => {
    const repositories = fakeRepositories({
      findAssistantTurnByRun: vi.fn<SidechatRepositories["findAssistantTurnByRun"]>(async () => ({
        ...assistantTurnRecord("turn-1"),
        runId: "run-1",
      })),
      findClientToolDispatch: vi.fn<SidechatRepositories["findClientToolDispatch"]>(async () => ({
        workspaceId: toWorkspaceId(AUTH.workspaceId),
        clientToolDispatchId: toClientToolDispatchId("dispatch-1"),
        assistantTurnId: toAssistantTurnId("turn-1"),
        toolCallId: toToolCallId("call-1"),
        toolName: "open_resource",
        clientToolCapabilityDigest: "a".repeat(64),
        state: "dispatched" as const,
        dispatchedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    });
    const store = createPostgresClientToolDispatchStore(repositories);

    await expect(store.findOwned(AUTH, "run-1", "call-1", "b".repeat(64))).resolves.toBe(
      CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND,
    );
  });
});
