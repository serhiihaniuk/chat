import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";

import {
  createInitialWorkflowConversationSelection,
  createPersistedWorkflowSelection,
  createWorkflowDraftSelection,
  promoteWorkflowSelection,
  useWorkflowConversationSelection,
  type WorkflowConversationSelection,
  WORKFLOW_CONVERSATION_SELECTION_KIND,
} from "./use-workflow-conversation-selection.js";

const SCOPE_KEY = "test-scope";

describe("workflow conversation selection state", () => {
  it("starts with a client-only draft when no initial conversation or recovery exists", () => {
    expect(
      createInitialWorkflowConversationSelection(undefined, undefined, undefined, () => "draft-1"),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.DRAFT,
      conversationId: "draft-1",
    });
  });

  it("treats an explicit initial conversation as persisted", () => {
    expect(
      createInitialWorkflowConversationSelection(
        "conversation-1",
        undefined,
        "conversation-stored",
      ),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-1",
    });
  });

  it("restores the active recovery conversation ahead of an initial selection", () => {
    expect(
      createInitialWorkflowConversationSelection(
        "conversation-old",
        {
          conversationId: "conversation-running",
          runId: "run-running",
          scopeKey: SCOPE_KEY,
        },
        "conversation-stored",
      ),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-running",
    });
  });

  it("restores a stored idle selection before falling back to New chat", () => {
    expect(
      createInitialWorkflowConversationSelection(undefined, undefined, "conversation-stored"),
    ).toEqual({
      kind: WORKFLOW_CONVERSATION_SELECTION_KIND.PERSISTED,
      conversationId: "conversation-stored",
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

describe("workflow conversation selection recovery cursor", () => {
  let harness: ReactDomTestHarness;

  beforeEach(() => {
    harness = createReactDomTestHarness();
  });
  afterEach(() => {
    harness.cleanup();
  });

  it("clears the focused run on New chat and ignores a delayed background acceptance", () => {
    const storageKey = "workflow-active-turn";
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        conversationId: "conversation-running",
        runId: "run-running",
        scopeKey: SCOPE_KEY,
      }),
    );
    const current = renderSelection(harness, undefined, storageKey, undefined);
    expect(current.value?.activeConversationId).toBe("conversation-running");

    act(() => current.value?.startNewConversation());
    const draftId = current.value?.activeConversationId;
    expect(current.value?.isLocalDraft).toBe(true);
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => current.value?.acceptedRun("conversation-running", "run-delayed", "a".repeat(64)));
    expect(current.value?.activeConversationId).toBe(draftId);
    expect(current.value?.isLocalDraft).toBe(true);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("stores only the selected conversation's discovered active run", () => {
    const storageKey = "workflow-active-turn";
    const current = renderSelection(harness, "conversation-1", storageKey, undefined);
    act(() => current.value?.focusActiveRun("conversation-other", "run-other"));
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => current.value?.focusActiveRun("conversation-1", "run-1"));
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? "null")).toEqual({
      conversationId: "conversation-1",
      runId: "run-1",
      scopeKey: SCOPE_KEY,
    });

    act(() => current.value?.selectConversation("conversation-2"));
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("clears a stale recovery cursor without replacing the persisted selection", () => {
    const storageKey = "workflow-active-turn";
    const cursor = { conversationId: "conversation-1", runId: "run-stale", scopeKey: SCOPE_KEY };
    sessionStorage.setItem(storageKey, JSON.stringify(cursor));
    const current = renderSelection(harness, undefined, storageKey, undefined);
    act(() => current.value?.discardInvalidRecovery(cursor));

    expect(current.value?.activeConversationId).toBe("conversation-1");
    expect(current.value?.isLocalDraft).toBe(false);
    expect(current.value?.recoveryCursor).toBeUndefined();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("restores, updates, and explicitly clears tab-scoped idle selection", () => {
    const selectionStorageKey = "workflow-conversation-selection";
    sessionStorage.setItem(
      selectionStorageKey,
      JSON.stringify({ conversationId: "conversation-restored", scopeKey: SCOPE_KEY }),
    );
    const current = renderSelection(harness, undefined, undefined, selectionStorageKey);
    expect(current.value?.activeConversationId).toBe("conversation-restored");

    act(() => current.value?.selectConversation("conversation-next"));
    expect(JSON.parse(sessionStorage.getItem(selectionStorageKey) ?? "null")).toEqual({
      conversationId: "conversation-next",
      scopeKey: SCOPE_KEY,
    });

    act(() => current.value?.startNewConversation());
    expect(current.value?.isLocalDraft).toBe(true);
    expect(sessionStorage.getItem(selectionStorageKey)).toBeNull();
  });
});

function renderSelection(
  harness: ReactDomTestHarness,
  initialConversationId: string | undefined,
  activeTurnStorageKey: string | undefined,
  selectionStorageKey: string | undefined,
): { value: WorkflowConversationSelection | undefined } {
  const current: { value: WorkflowConversationSelection | undefined } = { value: undefined };
  const Probe = () => {
    current.value = useWorkflowConversationSelection(
      SCOPE_KEY,
      initialConversationId,
      activeTurnStorageKey,
      selectionStorageKey,
    );
    return null;
  };
  harness.render(createElement(Probe));
  return current;
}
