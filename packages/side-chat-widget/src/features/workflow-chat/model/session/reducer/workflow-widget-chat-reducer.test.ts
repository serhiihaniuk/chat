import { describe, expect, it } from "vitest";

import { normalizeWorkflowChatError, type WorkflowUIMessage } from "#entities/workflow-chat";
import {
  createWorkflowWidgetChatState,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
  workflowWidgetChatReducer,
} from "./workflow-widget-chat-reducer.js";

const USER: WorkflowUIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

const PARTIAL: WorkflowUIMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "Part" }],
};

function activeState() {
  let state = createWorkflowWidgetChatState([USER], { runId: "run-1", turnId: "turn-1" });
  state = workflowWidgetChatReducer(state, {
    type: "AttachmentStarted",
    epochId: "epoch-1",
    reconnecting: true,
    runId: "run-1",
  });
  return state;
}

describe("workflowWidgetChatReducer", () => {
  it("deduplicates progressive message projections by stable id", () => {
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: PARTIAL,
    });
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: { ...PARTIAL, parts: [{ type: "text", text: "Partial answer" }] },
    });

    expect(state.messages.filter((message) => message.id === "assistant-1")).toHaveLength(1);
    expect(JSON.stringify(state.messages)).toContain("Partial answer");
  });

  it("keeps snapshot content visible while a replayed prefix catches up", () => {
    let state = createWorkflowWidgetChatState(
      [USER, { ...PARTIAL, parts: [{ type: "text", text: "Longer partial" }] }],
      { runId: "run-1", turnId: "turn-1" },
    );
    state = workflowWidgetChatReducer(state, {
      type: "AttachmentStarted",
      epochId: "epoch-1",
      reconnecting: true,
      runId: "run-1",
    });
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: PARTIAL,
    });

    expect(JSON.stringify(state.messages)).toContain("Longer partial");
  });

  it("merges a same-run snapshot without replacing the live attachment or partial", () => {
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: { ...PARTIAL, parts: [{ type: "text", text: "Live partial answer" }] },
    });
    state = workflowWidgetChatReducer(state, {
      type: "SnapshotLoaded",
      activeTurn: { runId: "run-1", turnId: "turn-1" },
      messages: [USER],
      observationId: "same-run-refresh",
    });

    expect(JSON.stringify(state.messages)).toContain("Live partial answer");
    expect(state.activeEpoch).toEqual({ epochId: "epoch-1", runId: "run-1" });
    expect(state.streamStarted).toBe(true);
    expect(state.transport).toBe(WORKFLOW_WIDGET_TRANSPORT.LIVE);
  });

  it("ignores late parts from disposed epochs", () => {
    let state = activeState();
    state = workflowWidgetChatReducer(state, { type: "EpochDisposed", epochId: "epoch-1" });
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: PARTIAL,
    });

    expect(state.messages).toEqual([USER]);
  });

  it("makes a server-authored terminal final for stream input", () => {
    const terminalMessage: WorkflowUIMessage = {
      ...PARTIAL,
      metadata: {
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        terminal: { status: "completed", finishReason: "stop" },
      },
    };
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: terminalMessage,
    });
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: { ...PARTIAL, parts: [{ type: "text", text: "Late overwrite" }] },
    });

    expect(state.turn).toBe(WORKFLOW_WIDGET_TURN.TERMINAL);
    expect(state.terminal.kind).toBe("completed");
    expect(JSON.stringify(state.messages)).not.toContain("Late overwrite");
  });

  it("treats reconnect loss as a transport phase rather than a terminal", () => {
    const error = normalizeWorkflowChatError(new Error("Connection lost."));
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "TransportDropped",
      epochId: "epoch-1",
      error,
    });

    expect(state.transport).toBe(WORKFLOW_WIDGET_TRANSPORT.LOST);
    expect(state.terminal).toEqual({ kind: "none" });
    expect(state.activeRunId).toBe("run-1");
  });

  it("reports an automatic replay attempt as reconnecting until HTTP reconnects", () => {
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "TransportRecovered",
      epochId: "epoch-1",
    });
    state = workflowWidgetChatReducer(state, {
      type: "TransportReconnecting",
      epochId: "epoch-1",
    });

    expect(state.transport).toBe(WORKFLOW_WIDGET_TRANSPORT.RECONNECTING);
    expect(state.terminal).toEqual({ kind: "none" });

    state = workflowWidgetChatReducer(state, {
      type: "TransportRecovered",
      epochId: "epoch-1",
    });

    expect(state.transport).toBe(WORKFLOW_WIDGET_TRANSPORT.LIVE);
  });

  it("keeps cancel provisional until a server snapshot confirms the outcome", () => {
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: PARTIAL,
    });
    state = workflowWidgetChatReducer(state, { type: "CancelRequested", runId: "run-1" });

    expect(state.cancelRequested).toBe(true);
    expect(state.terminal).toEqual({ kind: "none" });
    expect(state.streamStarted).toBe(true);
    expect(state.turn).toBe(WORKFLOW_WIDGET_TURN.STREAMING);

    state = workflowWidgetChatReducer(state, {
      type: "SnapshotLoaded",
      activeTurn: undefined,
      observationId: "terminal-snapshot",
      messages: [
        USER,
        {
          ...PARTIAL,
          metadata: {
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            terminal: { status: "cancelled" },
          },
        },
      ],
    });

    expect(state.cancelRequested).toBe(false);
    expect(state.terminal.kind).toBe("cancelled");
  });

  it("keeps a settled client-tool claim across a newer snapshot of the same run", () => {
    const toolMessage: WorkflowUIMessage = {
      id: "assistant-tool",
      role: "assistant",
      parts: [
        {
          type: "tool-open_document",
          toolCallId: "tool-call-1",
          state: "input-available",
          input: { resourceId: "doc-1" },
        },
      ],
    };
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: toolMessage,
    });
    state = workflowWidgetChatReducer(state, {
      type: "ClientToolClaimed",
      toolCallId: "tool-call-1",
    });
    state = workflowWidgetChatReducer(state, {
      type: "ClientToolSettled",
      toolCallId: "tool-call-1",
    });
    state = workflowWidgetChatReducer(state, {
      type: "SnapshotLoaded",
      activeTurn: { runId: "run-1", turnId: "turn-1" },
      messages: [USER, toolMessage],
      observationId: "newer-snapshot",
    });

    expect(state.pending.clientToolCallIds).not.toContain("tool-call-1");
    expect(state.pending.handledClientToolCallIds).toContain("tool-call-1");
  });

  it("keeps an approval decision across a newer snapshot of the same run", () => {
    const approvalMessage = {
      id: "assistant-approval",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "tool-call-approval",
          toolName: "needs_access",
          state: "approval-requested",
          input: { resourceId: "doc-1" },
          approval: { id: "approval-1" },
        },
      ],
    } satisfies WorkflowUIMessage;
    let state = activeState();
    state = workflowWidgetChatReducer(state, {
      type: "PartReceived",
      epochId: "epoch-1",
      message: approvalMessage,
    });
    state = workflowWidgetChatReducer(state, {
      type: "ApprovalRequestStarted",
      approvalId: "approval-1",
      decision: "approved",
    });
    expect(state.approvalDecisions).toEqual({ "approval-1": "approved" });
    state = workflowWidgetChatReducer(state, {
      type: "ApprovalDecisionRecorded",
      approvalId: "approval-1",
      decision: "approved",
    });
    state = workflowWidgetChatReducer(state, {
      type: "SnapshotLoaded",
      activeTurn: { runId: "run-1", turnId: "turn-1" },
      messages: [USER, approvalMessage],
      observationId: "newer-snapshot",
    });

    expect(state.approvalDecisions).toEqual({ "approval-1": "approved" });
    expect(state.pending.approvalIds).not.toContain("approval-1");
  });
});
