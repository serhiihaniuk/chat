// @vitest-environment happy-dom

import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkflowTimelineMessage } from "../../model/native-message-projection.js";
import { WorkflowMessageTimeline } from "../workflow-message-timeline.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

describe("WorkflowMessageTimeline reasoning disclosure", () => {
  it("opens active thinking, collapses when answer text starts, and stays user-controlled", () => {
    renderTimeline(reasoningMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("checking context");

    renderTimeline(answeringMessage(), true);
    expect(reasoningTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("checking context");

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
    expect(container.textContent).not.toContain("checking context");
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
  act(() => root.render(<WorkflowMessageTimeline isStreaming={isStreaming} message={message} />));
};

const reasoningTrigger = (): HTMLButtonElement => {
  const trigger = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!trigger) throw new Error("Expected the reasoning trigger.");
  return trigger;
};

const assignGlobal = (name: string, value: unknown): void => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
};
