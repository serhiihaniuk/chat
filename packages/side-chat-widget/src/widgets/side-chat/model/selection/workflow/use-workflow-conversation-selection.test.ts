import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  createInitialWorkflowConversationSelection,
  createPersistedWorkflowSelection,
  createWorkflowDraftSelection,
  promoteWorkflowSelection,
  useWorkflowConversationSelection,
  type WorkflowConversationSelection,
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

describe("workflow conversation selection recovery cursor", () => {
  const openWindows: Window[] = [];

  afterEach(() => {
    for (const currentWindow of openWindows) currentWindow.close();
    openWindows.length = 0;
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("clears the focused run on New chat and ignores a delayed background acceptance", () => {
    const storageKey = "workflow-active-turn";
    const currentWindow = new Window();
    openWindows.push(currentWindow);
    Object.defineProperty(globalThis, "window", { configurable: true, value: currentWindow });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: currentWindow.document,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: currentWindow.sessionStorage,
    });
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ conversationId: "conversation-running", runId: "run-running" }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const current: { value: WorkflowConversationSelection | undefined } = { value: undefined };
    const Probe = () => {
      current.value = useWorkflowConversationSelection(undefined, storageKey);
      return null;
    };

    act(() => root.render(createElement(Probe)));
    expect(current.value?.activeConversationId).toBe("conversation-running");

    act(() => current.value?.startNewConversation());
    const draftId = current.value?.activeConversationId;
    expect(current.value?.isLocalDraft).toBe(true);
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => current.value?.acceptedRun("conversation-running", "run-delayed"));
    expect(current.value?.activeConversationId).toBe(draftId);
    expect(current.value?.isLocalDraft).toBe(true);
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => root.unmount());
  });

  it("stores only the selected conversation's discovered active run", () => {
    const storageKey = "workflow-active-turn";
    const currentWindow = new Window();
    openWindows.push(currentWindow);
    Object.defineProperty(globalThis, "window", { configurable: true, value: currentWindow });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: currentWindow.document,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: currentWindow.sessionStorage,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const current: { value: WorkflowConversationSelection | undefined } = { value: undefined };
    const Probe = () => {
      current.value = useWorkflowConversationSelection("conversation-1", storageKey);
      return null;
    };

    act(() => root.render(createElement(Probe)));
    act(() => current.value?.focusActiveRun("conversation-other", "run-other"));
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => current.value?.focusActiveRun("conversation-1", "run-1"));
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? "null")).toEqual({
      conversationId: "conversation-1",
      runId: "run-1",
    });

    act(() => current.value?.selectConversation("conversation-2"));
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    act(() => root.unmount());
  });

  it("clears a stale recovery cursor without replacing the persisted selection", () => {
    const storageKey = "workflow-active-turn";
    const currentWindow = new Window();
    openWindows.push(currentWindow);
    Object.defineProperty(globalThis, "window", { configurable: true, value: currentWindow });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: currentWindow.document,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: currentWindow.sessionStorage,
    });
    const cursor = { conversationId: "conversation-1", runId: "run-stale" };
    sessionStorage.setItem(storageKey, JSON.stringify(cursor));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const current: { value: WorkflowConversationSelection | undefined } = { value: undefined };
    const Probe = () => {
      current.value = useWorkflowConversationSelection(undefined, storageKey);
      return null;
    };

    act(() => root.render(createElement(Probe)));
    act(() => current.value?.discardInvalidRecovery(cursor));

    expect(current.value?.activeConversationId).toBe("conversation-1");
    expect(current.value?.isLocalDraft).toBe(false);
    expect(current.value?.recoveryCursor).toBeUndefined();
    expect(sessionStorage.getItem(storageKey)).toBeNull();

    act(() => root.unmount());
  });
});
