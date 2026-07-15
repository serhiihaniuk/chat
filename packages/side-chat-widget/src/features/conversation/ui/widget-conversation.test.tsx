import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWidgetMessage, type WidgetMessage } from "#entities/chat";
import { WidgetConversation, WidgetNotice } from "./widget-conversation.js";

let previousGlobals: [string, PropertyDescriptor | undefined][] = [];

describe("WidgetNotice", () => {
  it("renders an error notice with a retry control", () => {
    const html = renderToStaticMarkup(
      <WidgetNotice
        notice={{ kind: "error", message: "Chat client request failed: 502" }}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("Chat client request failed: 502");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
  });

  it("renders a blocked notice with no retry control", () => {
    const html = renderToStaticMarkup(
      <WidgetNotice
        notice={{ kind: "blocked", message: "This response was blocked by a safety filter." }}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("This response was blocked by a safety filter.");
    // Blocked is a calm status notice, never the red alert, and never a retry.
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Try again");
  });
});

describe("WidgetConversation auto-scroll", () => {
  let root: Root;
  let container: HTMLElement;
  let windowRef: Window;
  let resizeObservers: TestResizeObserver[];

  beforeEach(() => {
    previousGlobals = [];
    resizeObservers = [];
    windowRef = new Window();
    assignGlobal("window", windowRef);
    assignGlobal("document", windowRef.document);
    assignGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    assignGlobal("Element", windowRef.Element);
    assignGlobal("HTMLElement", windowRef.HTMLElement);
    assignGlobal("HTMLButtonElement", windowRef.HTMLButtonElement);
    assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
    assignGlobal("requestAnimationFrame", windowRef.requestAnimationFrame.bind(windowRef));
    assignGlobal("cancelAnimationFrame", windowRef.cancelAnimationFrame.bind(windowRef));
    assignGlobal("Event", windowRef.Event);
    assignGlobal("WheelEvent", windowRef.WheelEvent);
    assignGlobal(
      "ResizeObserver",
      class {
        private readonly observer: TestResizeObserver;

        constructor(callback: ResizeObserverCallback) {
          this.observer = new TestResizeObserver(callback);
          resizeObservers.push(this.observer);
        }

        observe(target: Element): void {
          this.observer.observe(target);
        }

        unobserve(): void {
          this.observer.disconnect();
        }

        disconnect(): void {
          this.observer.disconnect();
        }
      },
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    windowRef.close();
    for (const [name, descriptor] of previousGlobals.slice().reverse()) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it("scrolls to bottom again when the user submits while detached", async () => {
    const firstMessages = [
      message("user-1", "user", "Question"),
      message("assistant-1", "assistant", "Answer"),
    ];
    renderConversation(root, firstMessages);
    const scroller = conversationScroller();
    const metrics = installScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 300 });
    await notifyContentResize(300, resizeObservers);

    userScrollsTo(scroller, 80);
    await settleStickToBottom();
    expect(goToBottomButton()).not.toBeNull();

    metrics.scrollHeight = 420;
    renderConversation(root, [...firstMessages, message("user-2", "user", "Follow up")]);
    await settleStickToBottom();

    expect(scroller.scrollTop).toBe(bottomScrollTop(metrics));
    expect(goToBottomButton()).toBeNull();
  });

  it("keeps a streaming response detached until the user returns to bottom", async () => {
    const userMessage = message("user-1", "user", "Question");
    const firstMessages = [userMessage, message("assistant-1", "assistant", "One", true)];
    renderConversation(root, firstMessages);
    const scroller = conversationScroller();
    const metrics = installScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 300 });
    await notifyContentResize(300, resizeObservers);

    userScrollsTo(scroller, 80);
    await settleStickToBottom();
    metrics.scrollHeight = 360;
    renderConversation(root, [userMessage, message("assistant-1", "assistant", "One two", true)]);
    await notifyContentResize(360, resizeObservers);

    expect(scroller.scrollTop).toBe(80);
    expect(goToBottomButton()).not.toBeNull();

    userScrollsTo(scroller, bottomScrollTop(metrics));
    await settleStickToBottom();
    metrics.scrollHeight = 430;
    renderConversation(root, [
      userMessage,
      message("assistant-1", "assistant", "One two three", true),
    ]);
    await notifyContentResize(430, resizeObservers, 420);

    expect(scroller.scrollTop).toBeGreaterThanOrEqual(bottomScrollTop(metrics) - 10);
    expect(goToBottomButton()).toBeNull();
  });

  it("reattaches when the go-to-bottom button is pressed", async () => {
    renderConversation(root, [
      message("user-1", "user", "Question"),
      message("assistant-1", "assistant", "Answer"),
    ]);
    const scroller = conversationScroller();
    const metrics = installScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 300 });
    await notifyContentResize(300, resizeObservers);

    userScrollsTo(scroller, 80);
    await settleStickToBottom();
    const button = goToBottomButton();
    if (!(button instanceof HTMLElement)) throw new Error("Expected go-to-bottom button.");

    act(() => button.click());
    await settleStickToBottom();

    expect(scroller.scrollTop).toBe(bottomScrollTop(metrics));
    expect(goToBottomButton()).toBeNull();
  });
});

class TestResizeObserver implements ResizeObserver {
  private target: Element | undefined;

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {
    this.disconnect();
  }

  disconnect(): void {
    this.target = undefined;
  }

  notify(height: number): void {
    if (!this.target) return;
    this.callback([createResizeObserverEntry(this.target, height)], this);
  }
}

const createResizeObserverEntry = (target: Element, height: number): ResizeObserverEntry => ({
  target,
  contentRect: createDomRect(height),
  borderBoxSize: [],
  contentBoxSize: [],
  devicePixelContentBoxSize: [],
});

const createDomRect = (height: number): DOMRectReadOnly => ({
  x: 0,
  y: 0,
  width: 0,
  height,
  top: 0,
  right: 0,
  bottom: height,
  left: 0,
  toJSON: () => ({ height }),
});

const assignGlobal = (name: string, value: unknown): void => {
  previousGlobals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

const renderConversation = (root: Root, messages: readonly WidgetMessage[]): void => {
  act(() => {
    root.render(
      <WidgetConversation
        emptyState={<p>Empty</p>}
        notice={undefined}
        isLoadingHistory={false}
        messages={messages}
        onRetry={() => undefined}
      />,
    );
  });
};

const conversationScroller = (): HTMLElement => {
  const element = document.querySelector('[data-slot="conversation-scroll"]');
  if (!(element instanceof HTMLElement)) throw new Error("Expected conversation scroller.");
  return element;
};

const installScrollMetrics = (
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number },
): { clientHeight: number; scrollHeight: number } => {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  return metrics;
};

const bottomScrollTop = ({
  clientHeight,
  scrollHeight,
}: {
  clientHeight: number;
  scrollHeight: number;
}): number => Math.max(0, scrollHeight - clientHeight - 1);

const userScrollsTo = (element: HTMLElement, scrollTop: number): void => {
  act(() => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    element.scrollTop = scrollTop;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
};

const notifyContentResize = async (
  height: number,
  resizeObservers: readonly TestResizeObserver[],
  settleMs = 10,
): Promise<void> => {
  await act(async () => {
    for (const observer of resizeObservers) observer.notify(height);
    await waitForStickToBottom(settleMs);
  });
};

const settleStickToBottom = async (): Promise<void> => {
  await act(async () => {
    await waitForStickToBottom(10);
  });
};

const waitForStickToBottom = async (settleMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  await waitForAnimationFrames(3);
};

const waitForAnimationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }
};

const goToBottomButton = (): HTMLButtonElement | null =>
  document.querySelector('button[aria-label="Go to bottom"]');

const message = (
  id: string,
  role: WidgetMessage["role"],
  content: string,
  isStreaming = false,
): WidgetMessage => createWidgetMessage(id, role, content, isStreaming);
