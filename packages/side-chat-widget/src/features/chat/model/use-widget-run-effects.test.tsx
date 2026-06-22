import { Window } from "happy-dom";
import { act, createElement, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import type { RefreshConversations } from "#entities/conversation";
import { WIDGET_RUN_STATUSES, type WidgetRunState } from "./run/widget-run-state.js";
import { useWidgetRunEffects, type WidgetRunEffectsInput } from "./use-widget-run-effects.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", { configurable: true, value: windowRef.document });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
  vi.restoreAllMocks();
});

const buildRun = (overrides: Partial<WidgetRunState> = {}): WidgetRunState => ({
  requestId: "request-1",
  assistantTurnId: "turn-1",
  conversationId: "conversation-1",
  localUserMessageId: "user-1",
  localAssistantMessageId: "assistant-1",
  status: WIDGET_RUN_STATUSES.STREAMING,
  lastSeenSequence: 1,
  messages: [createWidgetMessage("assistant-1", "assistant", "hi", true)],
  usage: undefined,
  errorMessage: undefined,
  reconnectAttempt: 0,
  dispatchedHostCommandIds: [],
  ...overrides,
});

const noopRefresh: RefreshConversations = () => Promise.resolve([]);

type EffectsHarness = {
  readonly setConversationId: Mock<Dispatch<SetStateAction<string | undefined>>>;
  readonly streamOwnedConversationRef: { current: string | undefined };
  readonly render: (run: WidgetRunState | undefined) => void;
};

const renderEffects = (): EffectsHarness => {
  const setConversationId = vi.fn<Dispatch<SetStateAction<string | undefined>>>();
  const streamOwnedConversationRef = { current: undefined as string | undefined };
  const runRef: { current: WidgetRunState | undefined } = { current: undefined };

  const Probe = () => {
    const input: WidgetRunEffectsInput = {
      run: runRef.current,
      setConversationId,
      setErrorMessage: () => {},
      streamOwnedConversationRef,
      pendingConversationTitleRef: { current: undefined },
      refreshConversations: noopRefresh,
      upsertStartedConversation: () => {},
    };
    useWidgetRunEffects(input);
    return null;
  };

  const render = (run: WidgetRunState | undefined): void => {
    runRef.current = run;
    act(() => root.render(createElement(Probe)));
  };
  return { setConversationId, streamOwnedConversationRef, render };
};

describe("useAdoptStartedConversation", () => {
  it("adopts the server-assigned conversation exactly once per run", () => {
    const harness = renderEffects();

    harness.render(buildRun());

    expect(harness.setConversationId).toHaveBeenCalledTimes(1);
    expect(harness.setConversationId).toHaveBeenCalledWith("conversation-1");
    expect(harness.streamOwnedConversationRef.current).toBe("conversation-1");
  });

  it("does not re-adopt after a conversation switch resets the stream-owned ref", () => {
    // Regression: adoption used to be guarded by the history-refetch ref, which a
    // later selectConversation resets. The next streamed delta then re-ran
    // adoption and yanked the user back to the in-flight turn. Adoption is now
    // keyed by the run's request id, so a reset ref cannot re-trigger it.
    const harness = renderEffects();
    harness.render(buildRun());
    expect(harness.setConversationId).toHaveBeenCalledTimes(1);

    // The user selects another conversation — that clears the stream-owned ref...
    harness.streamOwnedConversationRef.current = undefined;
    // ...then another delta lands for the same run (a fresh state object).
    harness.render(
      buildRun({ messages: [createWidgetMessage("assistant-1", "assistant", "hi there", true)] }),
    );

    expect(harness.setConversationId).toHaveBeenCalledTimes(1);
  });
});
