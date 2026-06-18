import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";

import type { ConversationSummary, SideChatApiClient } from "#entities/conversation";

// Shared happy-dom + React rendering harness for the SideChatWidget DOM tests in
// this folder. Excluded from the package build (see tsconfig "exclude"); it is a
// test fixture, not shipped widget code.

let windowRef: Window;
let root: Root;
let container: HTMLElement;
let previousGlobals: [string, PropertyDescriptor | undefined][];

// Registers the per-test happy-dom lifecycle. Call once at the top of a test file.
export const installWidgetTestDom = (): void => {
  beforeEach(() => {
    previousGlobals = [];
    windowRef = new Window();
    assignGlobal("window", windowRef);
    assignGlobal("document", windowRef.document);
    assignGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    assignGlobal("Element", windowRef.Element);
    assignGlobal("HTMLElement", windowRef.HTMLElement);
    assignGlobal("HTMLButtonElement", windowRef.HTMLButtonElement);
    assignGlobal("HTMLTextAreaElement", windowRef.HTMLTextAreaElement);
    assignGlobal("Document", windowRef.Document);
    assignGlobal("DOMRect", windowRef.DOMRect);
    assignGlobal("DOMRectReadOnly", windowRef.DOMRectReadOnly);
    assignGlobal("IntersectionObserver", windowRef.IntersectionObserver);
    assignGlobal("MouseEvent", windowRef.MouseEvent);
    assignGlobal("MutationObserver", windowRef.MutationObserver);
    assignGlobal("Node", windowRef.Node);
    assignGlobal("PointerEvent", windowRef.PointerEvent);
    assignGlobal("SVGElement", windowRef.SVGElement);
    assignGlobal("Event", windowRef.Event);
    assignGlobal("FormData", windowRef.FormData);
    assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
    assignGlobal("requestAnimationFrame", windowRef.requestAnimationFrame.bind(windowRef));
    assignGlobal("cancelAnimationFrame", windowRef.cancelAnimationFrame.bind(windowRef));
    assignGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // Base UI's ScrollArea viewport calls Element.getAnimations(); happy-dom omits it.
    if (typeof Reflect.get(windowRef.Element.prototype, "getAnimations") !== "function") {
      Reflect.set(windowRef.Element.prototype, "getAnimations", () => []);
    }
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    windowRef?.close();
    vi.restoreAllMocks();
    for (const [name, descriptor] of previousGlobals.slice().reverse()) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });
};

const assignGlobal = (name: string, value: unknown): void => {
  previousGlobals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

export const mountWidget = (element: ReactElement): void => {
  act(() => {
    root.render(element);
  });
};

export const submit = async (message: string): Promise<void> => {
  const textarea = document.querySelector("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Expected textarea.");

  act(() => {
    textarea.value = message;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickButton("Send");
};

export const clickButton = async (name: string): Promise<void> => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name,
  );
  if (!(button instanceof HTMLElement)) throw new Error(`Expected button ${name}.`);
  await act(async () => {
    pressElement(button);
    await Promise.resolve();
  });
};

const pressElement = (element: HTMLElement): void => {
  element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  element.click();
};

export const waitForText = async (text: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error(`Expected document text to include ${text}.`);
};

export const fakeClient = (
  createEvents: (
    request: ChatStreamRequest,
  ) => AsyncIterable<SidechatStreamEvent> | Promise<AsyncIterable<SidechatStreamEvent>>,
  overrides: Partial<
    Pick<SideChatApiClient, "listConversations" | "listModels" | "readHistory">
  > = {},
): SideChatApiClient => ({
  ...overrides,
  streamChat: async (request) => ({
    attempt: 1,
    events: await createEvents(request),
  }),
});

export const baseEvent = (sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `event-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T13:00:00.000Z",
});

export const started = (conversationId = "conversation-1"): StartedEvent => ({
  ...baseEvent(0),
  type: "sidechat.started",
  conversationId,
});

export const delta = (content: string): DeltaEvent => ({
  ...baseEvent(1),
  type: "sidechat.delta",
  content,
});

export const completed = (): CompletedEvent => ({
  ...baseEvent(2),
  type: "sidechat.completed",
  finishReason: "stop",
});

export const conversationSummary = (
  conversationId: string,
  title: string,
): ConversationSummary => ({
  conversationId,
  title,
  status: "active",
  createdAt: "2026-05-23T13:00:00.000Z",
  updatedAt: "2026-05-23T13:00:00.000Z",
  lastMessageAt: "2026-05-23T13:00:00.000Z",
});
