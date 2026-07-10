import { Window } from "happy-dom";
import { act, createElement, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import type {
  ReadHistoryResult,
  RefreshConversations,
  RefreshHistory,
} from "#entities/conversation";
import { WIDGET_RUN_STATUSES, type WidgetRunState } from "./run/widget-run-state.js";
import {
  createRunShellBridge,
  type RunShellBridge,
} from "./conversation/shell/run-shell-bridge.js";
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

const settledHistory = (conversationId = "conversation-1"): ReadHistoryResult => ({
  conversationId,
  messages: [],
});

type EffectsHarness = {
  readonly setConversationId: Mock<Dispatch<SetStateAction<string | undefined>>>;
  readonly setErrorMessage: Mock<Dispatch<SetStateAction<string | undefined>>>;
  readonly refreshHistory: Mock<RefreshHistory>;
  readonly clearRun: Mock<() => void>;
  readonly shellBridge: RunShellBridge;
  readonly replaceRunSnapshot: (run: WidgetRunState | undefined) => void;
  readonly render: (run: WidgetRunState | undefined) => void;
};

const renderEffects = (
  options: { readonly refreshHistory?: RefreshHistory | undefined } = {},
): EffectsHarness => {
  const setConversationId = vi.fn<Dispatch<SetStateAction<string | undefined>>>();
  const setErrorMessage = vi.fn<Dispatch<SetStateAction<string | undefined>>>();
  const refreshHistory = vi.fn<RefreshHistory>(
    options.refreshHistory ?? (() => Promise.resolve(settledHistory())),
  );
  const clearRun = vi.fn<() => void>();
  const shellBridge = createRunShellBridge();
  const runRef: { current: WidgetRunState | undefined } = { current: undefined };

  const Probe = () => {
    const input: WidgetRunEffectsInput = {
      run: runRef.current,
      setConversationId,
      setErrorMessage,
      shellBridge,
      refreshConversations: noopRefresh,
      upsertStartedConversation: () => {},
      refreshHistory,
      clearRun,
      getRun: () => runRef.current,
    };
    useWidgetRunEffects(input);
    return null;
  };

  const render = (run: WidgetRunState | undefined): void => {
    runRef.current = run;
    act(() => root.render(createElement(Probe)));
  };
  return {
    setConversationId,
    setErrorMessage,
    refreshHistory,
    clearRun,
    shellBridge,
    replaceRunSnapshot: (run) => {
      runRef.current = run;
    },
    render,
  };
};

/** Let the handoff's awaited refetch promise chain settle inside act. */
const settleHandoff = () => act(() => Promise.resolve());

describe("useAdoptStartedConversation", () => {
  it("adopts the server-assigned conversation exactly once per run", () => {
    const harness = renderEffects();

    harness.render(buildRun());

    expect(harness.setConversationId).toHaveBeenCalledTimes(1);
    expect(harness.setConversationId).toHaveBeenCalledWith("conversation-1");
    expect(harness.shellBridge.getSnapshot().streamOwnedConversationId).toBe("conversation-1");
  });

  it("does not re-adopt after a conversation switch resets the stream-owned field", () => {
    // Regression: adoption used to be guarded by the history-refetch field, which a
    // later selectConversation resets. The next streamed delta then re-ran
    // adoption and yanked the user back to the in-flight turn. Adoption is now
    // keyed by the run's request id, so a reset field cannot re-trigger it.
    const harness = renderEffects();
    harness.render(buildRun());
    expect(harness.setConversationId).toHaveBeenCalledTimes(1);

    // The user selects another conversation — that clears the stream-owned field...
    harness.shellBridge.resetForConversationSelection();
    // ...then another delta lands for the same run (a fresh state object).
    harness.render(
      buildRun({ messages: [createWidgetMessage("assistant-1", "assistant", "hi there", true)] }),
    );

    expect(harness.setConversationId).toHaveBeenCalledTimes(1);
  });
});

describe("useHistoryHandoffAfterTerminal", () => {
  it("refetches history on completion, then clears the run (fetch-then-clear)", async () => {
    const harness = renderEffects();
    harness.render(buildRun());
    expect(harness.clearRun).not.toHaveBeenCalled();

    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.COMPLETED }));
    await settleHandoff();

    expect(harness.refreshHistory).toHaveBeenCalledWith("conversation-1");
    expect(harness.clearRun).toHaveBeenCalledTimes(1);
    expect(harness.setErrorMessage).not.toHaveBeenCalled();
    expect(harness.shellBridge.getSnapshot().streamOwnedConversationId).toBeUndefined();
  });

  it("carries a failed run's error notice into shell state before clearing", async () => {
    const harness = renderEffects();

    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.FAILED, errorMessage: "boom" }));
    await settleHandoff();

    expect(harness.setErrorMessage).toHaveBeenCalledWith("boom");
    expect(harness.clearRun).toHaveBeenCalledTimes(1);
  });

  it("keeps the run visible when no fresh history lands", async () => {
    const harness = renderEffects({ refreshHistory: () => Promise.resolve(undefined) });

    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.COMPLETED }));
    await settleHandoff();

    expect(harness.clearRun).not.toHaveBeenCalled();
  });

  it("keeps a run that never got a conversation id (nothing to hand off to)", async () => {
    const harness = renderEffects();

    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.FAILED, conversationId: undefined }));
    await settleHandoff();

    expect(harness.refreshHistory).not.toHaveBeenCalled();
    expect(harness.clearRun).not.toHaveBeenCalled();
  });

  it("never clears a newer store snapshot before React re-renders the handoff effect", async () => {
    let resolveRefetch: (history: ReadHistoryResult | undefined) => void = () => {};
    const harness = renderEffects({
      refreshHistory: () =>
        new Promise((resolve) => {
          resolveRefetch = resolve;
        }),
    });
    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.COMPLETED }));

    // The external run store changes immediately, before React has rendered the
    // replacement and before a passive effect could mirror it into a ref.
    harness.replaceRunSnapshot(buildRun({ requestId: "request-2" }));
    resolveRefetch(settledHistory());
    await settleHandoff();

    expect(harness.clearRun).not.toHaveBeenCalled();
  });

  it("does not clear while the server still reports the turn running", async () => {
    // The terminal event can beat the durable status commit; a refetch that still
    // says "running" must not clear the run onto a transcript missing the answer.
    const harness = renderEffects({
      refreshHistory: () =>
        Promise.resolve({
          ...settledHistory(),
          activeTurn: { assistantTurnId: "turn-1", status: "running" },
        }),
    });

    harness.render(buildRun({ status: WIDGET_RUN_STATUSES.COMPLETED }));
    await settleHandoff();

    expect(harness.clearRun).not.toHaveBeenCalled();
  });
});
