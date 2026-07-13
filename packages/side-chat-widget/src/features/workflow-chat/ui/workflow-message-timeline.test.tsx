import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReasoningVisibility, ToolDetailLevel } from "#entities/settings";
import type { WorkflowUIMessage } from "#entities/workflow-chat";

import type { WorkflowChatTerminal } from "../model/use-workflow-widget-chat.js";
import {
  projectLatestAssistantUsage,
  projectWorkflowMessageParts,
  type WorkflowTimelineMessage,
} from "../model/native-message-projection.js";
import { WorkflowMessageTimeline } from "./workflow-message-timeline.js";

const assistant = (parts: readonly unknown[], id = "assistant-1"): WorkflowTimelineMessage => ({
  id,
  role: "assistant",
  parts,
});

const timedAssistant = (
  parts: readonly unknown[],
  activityDurationMs: number,
): WorkflowTimelineMessage => ({
  ...assistant(parts),
  metadata: {
    activityDurationMs,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  },
});

// isStreaming opens the activity fold so its trace rows render in static markup;
// a completed turn keeps them behind the collapsed "Thought process" trigger.
const renderTimeline = (
  message: WorkflowTimelineMessage,
  terminal?: WorkflowChatTerminal,
  isStreaming = false,
  toolDetail?: ToolDetailLevel,
  reasoningVisibility?: ReasoningVisibility,
): string =>
  renderToStaticMarkup(
    <WorkflowMessageTimeline
      isStreaming={isStreaming}
      message={message}
      onRetry={() => undefined}
      reasoningVisibility={reasoningVisibility}
      terminal={terminal}
      toolDetail={toolDetail}
    />,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkflowMessageTimeline", () => {
  it("shows copy only for a completed assistant answer", () => {
    const completed = renderTimeline(assistant([{ type: "text", text: "Copy this answer" }]));
    const streaming = renderTimeline(
      assistant([{ type: "text", text: "Still streaming" }]),
      undefined,
      true,
    );

    expect(completed).toContain("Copy");
    expect(completed).not.toContain("Retry");
    expect(streaming).not.toContain("Copy");
  });

  it("renders the durable completed activity duration and keeps streaming labeled as thinking", () => {
    const message = timedAssistant(
      [
        { type: "reasoning", text: "Checked the request" },
        { type: "text", text: "Done" },
      ],
      1_501,
    );

    expect(renderTimeline(message)).toContain("Thought for 2s");
    expect(renderTimeline(message, undefined, true)).toContain("Thinking");
    expect(renderTimeline(assistant([{ type: "reasoning", text: "Legacy history" }]))).toContain(
      "Thought process",
    );
  });

  it("projects usage from the newest assistant message only", () => {
    const messages: WorkflowUIMessage[] = [
      { id: "user-1", role: "user", parts: [] },
      {
        id: "assistant-1",
        role: "assistant",
        metadata: {
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
        parts: [],
      },
      { id: "user-2", role: "user", parts: [] },
      {
        id: "assistant-2",
        role: "assistant",
        metadata: {
          usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
        },
        parts: [],
      },
    ];

    expect(projectLatestAssistantUsage(messages)).toBe(9);
    expect(projectLatestAssistantUsage(messages.slice(0, 3))).toBe(3);
    expect(projectLatestAssistantUsage(messages.slice(0, 1))).toBeUndefined();
  });

  it("renders native text, reasoning, static and dynamic tools, approval, and denied states", () => {
    const html = renderTimeline(
      assistant([
        { type: "text", text: "Before" },
        { type: "reasoning", text: "Checking", state: "done" },
        {
          type: "tool-search",
          state: "input-available",
          input: { query: "docs" },
        },
        {
          type: "dynamic-tool",
          toolName: "lookup_weather",
          state: "output-available",
        },
        {
          type: "dynamic-tool",
          toolCallId: "call-approval",
          toolName: "needs_access",
          state: "approval-requested",
          input: { resourceId: "doc-1" },
          approval: { id: "approval-1" },
        },
        { type: "tool-delete", state: "output-denied" },
        { type: "text", text: "After" },
      ]),
      undefined,
      true,
    );

    expect(html).toContain("Before");
    expect(html).toContain("Thinking");
    expect(html).toContain('data-slot="tool-detail-row"');
    expect(html).toContain('data-slot="tool-row" data-state="success"');
    expect(html).toContain('data-slot="tool-approval"');
    expect(html).toContain("Approval required");
    expect(html).toContain("Approve");
    expect(html).toContain("Deny");
    expect(html).toContain("Reason (optional)");
    expect(html).toContain('data-slot="tool-row" data-state="denied"');
    expect(html).toContain("After");
  });

  it("updates one approval row in place for decided and typed expired states", () => {
    const decided = assistant([
      {
        type: "dynamic-tool",
        toolCallId: "call-approval",
        toolName: "needs_access",
        state: "approval-responded",
        input: {},
        approval: { id: "approval-1", approved: true },
      },
    ]);
    const decidedHtml = renderToStaticMarkup(
      <WorkflowMessageTimeline
        approvalDecisions={{}}
        message={decided}
        onApprovalDecision={() => Promise.resolve()}
      />,
    );
    expect(decidedHtml).toContain('data-slot="tool-approval" data-state="approved"');
    expect(decidedHtml).toContain("disabled");

    const expired = assistant([
      {
        type: "dynamic-tool",
        toolCallId: "call-approval",
        toolName: "needs_access",
        state: "approval-requested",
        input: {},
        approval: { id: "approval-1" },
      },
    ]);
    const expiredHtml = renderToStaticMarkup(
      <WorkflowMessageTimeline approvalDecisions={{ "approval-1": "expired" }} message={expired} />,
    );
    expect(expiredHtml).toContain('data-state="expired"');
    expect(expiredHtml).toContain("Approval expired");
    expect(expiredHtml).toContain("disabled");

    const foreignHtml = renderToStaticMarkup(
      <WorkflowMessageTimeline approvalDecisions={{ "approval-1": "foreign" }} message={expired} />,
    );
    expect(foreignHtml).toContain('data-state="foreign"');
    expect(foreignHtml).toContain("This approval is no longer available.");
    expect(foreignHtml).toContain("disabled");
  });

  it("keeps the same projected id when a tool part settles later", () => {
    const input = projectWorkflowMessageParts(
      assistant([
        {
          type: "dynamic-tool",
          toolCallId: "call-1",
          toolName: "lookup",
          state: "input-available",
          input: { query: "docs" },
        },
      ]),
    )[0];
    const output = projectWorkflowMessageParts(
      assistant([
        {
          type: "dynamic-tool",
          toolCallId: "call-1",
          toolName: "lookup",
          state: "output-available",
          input: { query: "docs" },
          output: { result: "ok" },
        },
      ]),
    )[0];

    expect(input?.id).toBe(output?.id);
  });

  it("groups reasoning and tools into one trace ahead of the answer", () => {
    const html = renderTimeline(
      assistant([
        { type: "reasoning", text: "thinking-trace" },
        { type: "dynamic-tool", toolName: "lookup", state: "input-streaming" },
        { type: "text", text: "the-answer" },
      ]),
      undefined,
      true,
    );

    // The thought and the tool row share one fold (thought then tool in source
    // order), and the whole trace precedes the answer — the legacy composition.
    expect(html.indexOf("thinking-trace")).toBeLessThan(html.indexOf("Lookup"));
    expect(html.indexOf("Lookup")).toBeGreaterThan(-1);
    expect(html.indexOf("Lookup")).toBeLessThan(html.indexOf("the-answer"));
  });

  it("drops tool rows from the trace at tool detail 'hidden' but keeps thoughts", () => {
    const html = renderTimeline(
      assistant([
        { type: "reasoning", text: "still-thinking" },
        {
          type: "dynamic-tool",
          toolName: "lookup_weather",
          state: "output-available",
          input: { city: "Zurich" },
          output: { temp: 20 },
        },
      ]),
      undefined,
      true,
      "hidden",
    );

    expect(html).toContain("still-thinking");
    expect(html).not.toContain('data-slot="tool-row"');
    expect(html).not.toContain('data-slot="tool-detail-row"');
  });

  it("pins a compact tool row without expandable payloads at tool detail 'name'", () => {
    const html = renderTimeline(
      assistant([
        {
          type: "dynamic-tool",
          toolName: "lookup_weather",
          state: "output-available",
          input: { city: "Zurich" },
          output: { temp: 20 },
        },
      ]),
      undefined,
      true,
      "name",
    );

    // The same call renders as an expandable detail row at "full"; "name" pins the
    // compact row so no payload is disclosed.
    expect(html).toContain('data-slot="tool-row"');
    expect(html).not.toContain('data-slot="tool-detail-row"');
  });

  it("keeps a completed trace open at reasoning visibility 'detailed'", () => {
    const message = assistant([
      { type: "reasoning", text: "kept-open" },
      { type: "text", text: "the-answer" },
    ]);
    const detailed = renderTimeline(message, undefined, false, undefined, "detailed");
    const minimal = renderTimeline(message, undefined, false, undefined, "minimal");

    // The chevron rotates only while the fold is open: "detailed" holds a completed
    // trace open, "minimal" leaves it collapsed behind the trigger.
    expect(detailed).toContain("rotate-180");
    expect(minimal).not.toContain("rotate-180");
  });

  it("renders source URL, source document, sanctioned image files, and non-network files", () => {
    const message = assistant([
      {
        type: "source-url",
        sourceId: "url-1",
        url: "https://example.test",
        title: "Docs",
      },
      {
        type: "source-document",
        sourceId: "doc-1",
        mediaType: "text/plain",
        title: "Readme",
        filename: "README.txt",
      },
      {
        type: "file",
        mediaType: "image/png",
        filename: "chart.png",
        url: "data:image/png;base64,AA",
      },
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "report.pdf",
        url: "https://example.test/report.pdf",
      },
    ]);
    const html = renderTimeline(message);
    const projected = projectWorkflowMessageParts(message);

    expect(html).toContain('data-slot="sources-fold"');
    expect(projected).toContainEqual(expect.objectContaining({ kind: "source", label: "Docs" }));
    expect(projected).toContainEqual(expect.objectContaining({ kind: "source", label: "Readme" }));
    expect(html).toContain('data-slot="activity-images"');
    expect(html).toContain('data-slot="file-presentation"');
    expect(html).toContain("report.pdf");
    expect(html).not.toContain('src="https://example.test/report.pdf"');
  });

  it("renders an empty assistant and a reasoning-only assistant without crashing", () => {
    const emptyMessage = assistant([]);
    const reasoningMessage = assistant([{ type: "reasoning", text: "Only thought" }]);
    const emptyHtml = renderTimeline(emptyMessage);
    const reasoningHtml = renderTimeline(reasoningMessage);
    const projected = projectWorkflowMessageParts(reasoningMessage);

    expect(emptyHtml).toContain('data-from="assistant"');
    expect(projected).toContainEqual(
      expect.objectContaining({ kind: "reasoning", text: "Only thought" }),
    );
    expect(reasoningHtml).toContain("Thought process");
  });

  it("ignores unknown parts and emits a development note without exposing payload data", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const html = renderTimeline(
      assistant([
        { type: "data-future", payload: "private-future-payload" },
        { type: "text", text: "safe" },
      ]),
    );

    expect(html).toContain("safe");
    expect(html).not.toContain("private-future-payload");
    expect(debug).toHaveBeenCalledWith(
      "[side-chat] ignored unknown native UI message part: data-future",
    );
  });

  it("projects only parts present at the terminal boundary", () => {
    const terminal: WorkflowChatTerminal = {
      kind: "completed",
      messageId: "assistant-1",
      partCount: 1,
      finishReason: "stop",
    };
    const html = renderTimeline(
      assistant([
        { type: "text", text: "before-terminal" },
        { type: "text", text: "post-terminal" },
      ]),
      terminal,
    );

    expect(html).toContain("before-terminal");
    expect(html).not.toContain("post-terminal");
  });

  it("keeps blocked and cancelled terminal notices calm without Retry", () => {
    const blocked: WorkflowChatTerminal = {
      kind: "blocked",
      messageId: "assistant-1",
      partCount: 0,
    };
    const cancelled: WorkflowChatTerminal = {
      kind: "cancelled",
      messageId: "assistant-1",
      partCount: 1,
    };

    const blockedHtml = renderTimeline(assistant([{ type: "text", text: "filtered" }]), blocked);
    const cancelledHtml = renderTimeline(assistant([{ type: "text", text: "partial" }]), cancelled);

    expect(blockedHtml).toContain('data-slot="blocked-notice"');
    expect(blockedHtml).not.toContain("Try again");
    expect(cancelledHtml).toContain('data-slot="cancelled-notice"');
    expect(cancelledHtml).not.toContain("Try again");
  });

  it("renders a fallback terminal that has no message id", () => {
    const terminal: WorkflowChatTerminal = {
      kind: "cancelled",
      partCount: 0,
    };

    const html = renderTimeline(assistant([], "workflow-terminal"), terminal);

    expect(html).toContain('data-slot="cancelled-notice"');
    expect(html).not.toContain("Try again");
  });

  it("shows Retry only for a retryable safe error terminal", () => {
    const terminal: WorkflowChatTerminal = {
      kind: "error",
      code: "provider_failed",
      message: "The model provider failed safely.",
      messageId: "assistant-1",
      partCount: 0,
      retryable: true,
    };
    const html = renderTimeline(assistant([]), terminal);

    expect(html).toContain('data-slot="error-notice"');
    expect(html).toContain("Try again");
    expect(html).toContain("The model provider failed safely.");
  });
});
