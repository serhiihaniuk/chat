import { expect, it, vi } from "vitest";

import type { ConversationTitleWorkflowInput } from "#application/conversations/generate-conversation-title";

import { finalizeGeneratedConversationTitle } from "./generate-conversation-title.js";

const INPUT: ConversationTitleWorkflowInput = {
  auth: { workspaceId: "workspace-1", subjectId: "subject-1", issuedAt: "now" },
  conversationId: "conversation-1",
  requestId: "request-1",
  modelId: "title-model",
  timeoutMs: 1_000,
  userContent: "How should pricing launch?",
  assistantContent: "Start with a measured cohort.",
  persistInWorkflow: true,
};

it("does not resolve a persistent title workflow before its durable write", async () => {
  let releaseWrite: (() => void) | undefined;
  const persist = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        releaseWrite = resolve;
      }),
  );
  const result = finalizeGeneratedConversationTitle(INPUT, "Pricing launch plan", persist);
  let resolved = false;
  void result.then(() => {
    resolved = true;
  });

  await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
  expect(resolved).toBe(false);
  releaseWrite?.();

  await expect(result).resolves.toEqual({
    title: "Pricing launch plan",
    persisted: true,
  });
});
