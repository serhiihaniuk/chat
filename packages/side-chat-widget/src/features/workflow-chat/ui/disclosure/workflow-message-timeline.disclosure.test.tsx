import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import type { WorkflowTimelineMessage } from "../../model/native-message-projection.js";
import { WorkflowMessageTimeline } from "../workflow-message-timeline.js";

let harness: ReactDomTestHarness;
let container: HTMLElement;

beforeEach(() => {
  harness = createReactDomTestHarness();
  container = harness.container;
});

afterEach(() => {
  harness.cleanup();
});

describe("WorkflowMessageTimeline reasoning disclosure", () => {
  it("opens active thinking, collapses when answer text starts, and stays user-controlled", () => {
    renderTimeline(reasoningMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("checking context");

    renderTimeline(answeringMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("false");

    // A later turn can rerender this completed answer while the session is busy.
    // That unrelated update must not reopen the previous trace.
    renderTimeline(answeringMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("false");

    act(() => reasoningTrigger().click());
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("checking context");

    renderTimeline(answeringMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("starts completed history collapsed", () => {
    renderTimeline(answeringMessage(), false);

    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("false");
  });
});

const reasoningMessage = (): WorkflowTimelineMessage => ({
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "reasoning", text: "**checking** context", state: "streaming" }],
});

const answeringMessage = (): WorkflowTimelineMessage => ({
  ...reasoningMessage(),
  parts: [
    { type: "reasoning", text: "**checking** context", state: "done" },
    { type: "text", text: "Answer started." },
  ],
});

const renderTimeline = (message: WorkflowTimelineMessage, isStreaming: boolean): void => {
  harness.render(<WorkflowMessageTimeline isStreaming={isStreaming} message={message} />);
};

const reasoningTrigger = (): HTMLButtonElement => {
  const trigger = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!trigger) throw new Error("Expected the reasoning trigger.");
  return trigger;
};
