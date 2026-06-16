import { createMemorySidechatRepositories } from "@side-chat/db";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createServiceContextBundle } from "./create-service-context-bundle.js";

const workspace = { tenantId: "tenant_ctx", workspaceId: "workspace_ctx" } as const;

const authContext = {
  tenantId: workspace.tenantId,
  workspaceId: workspace.workspaceId,
  subject: { subjectId: "subject_1", userId: "user_1" },
  actor: { subjectId: "subject_1", userId: "user_1" },
  roles: ["member"],
  scopes: ["conversation:read"],
  source: "test_authority",
  issuedAt: "2026-06-16T00:00:00.000Z",
} as const;

describe("createServiceContextBundle", () => {
  it("wires a history context port and a context manager from the repositories", () => {
    const bundle = createServiceContextBundle(
      { workspace },
      { repositories: createMemorySidechatRepositories() },
    );

    expect(bundle.historyContext.readConversationHistory).toBeTypeOf("function");
    expect(bundle.contextManager.prepareTurnContext).toBeTypeOf("function");
  });

  it("returns no history when the requested limit is not positive", async () => {
    const bundle = createServiceContextBundle(
      { workspace },
      { repositories: createMemorySidechatRepositories() },
    );

    const history = await Effect.runPromise(
      bundle.historyContext.readConversationHistory({
        authContext,
        workspace,
        conversation: { ...workspace, conversationId: "conversation_1", historyCutoffSequenceIndex: 0 },
        currentUserMessage: {
          ...workspace,
          conversationId: "conversation_1",
          messageId: "message_1",
          sequenceIndex: 1,
        },
        limit: 0,
      }),
    );

    expect(history).toEqual([]);
  });
});
