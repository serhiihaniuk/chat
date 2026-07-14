import { describe, expect, it } from "vitest";

import {
  createInitialWorkflowConversationSelection,
  createPersistedWorkflowSelection,
  createWorkflowDraftSelection,
  promoteWorkflowSelection,
  WORKFLOW_CONVERSATION_SELECTION_KIND,
} from "./use-workflow-conversation-selection.js";

describe("workflow conversation selection state", () => {
  it("starts with a client-only draft when no initial conversation or recovery exists", () => {
    expect(
      createInitialWorkflowConversationSelection(undefined, undefined, () => "draft-1"),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.DRAFT,
      conversationId: "draft-1",
    });
  });

  it("treats an explicit initial conversation as persisted", () => {
    expect(createInitialWorkflowConversationSelection("conversation-1", undefined)).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-1",
    });
  });

  it("restores the active recovery conversation ahead of an initial selection", () => {
    expect(
      createInitialWorkflowConversationSelection("conversation-old", {
        conversationId: "conversation-running",
        runId: "run-running",
      }),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-running",
    });
  });

  it("promotes a draft without changing its service request id", () => {
    const draft = createWorkflowDraftSelection(() => "draft-accepted");

    expect(promoteWorkflowSelection(draft)).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "draft-accepted",
    });
    expect(promoteWorkflowSelection(createPersistedWorkflowSelection("conversation-2"))).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-2",
    });
  });
});
