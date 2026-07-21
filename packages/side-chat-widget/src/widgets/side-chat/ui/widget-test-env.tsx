import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";

let windowRef: Window;
let root: Root;
let container: HTMLElement;
let previousGlobals: [string, PropertyDescriptor | undefined][];

/** Install the browser globals required by full-widget DOM tests. */
export const installWidgetTestDom = (): void => {
  beforeEach(() => {
    previousGlobals = [];
    windowRef = new Window();
    assignGlobal("window", windowRef);
    assignGlobal("document", windowRef.document);
    assignGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    for (const name of [
      "Element",
      "HTMLElement",
      "HTMLButtonElement",
      "HTMLTextAreaElement",
      "Document",
      "DOMRect",
      "DOMRectReadOnly",
      "IntersectionObserver",
      "MouseEvent",
      "MutationObserver",
      "Node",
      "PointerEvent",
      "SVGElement",
      "Event",
      "FormData",
    ] as const) {
      assignGlobal(name, Reflect.get(windowRef, name));
    }
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
    act(() => root.unmount());
    windowRef.close();
    vi.restoreAllMocks();
    for (const [name, descriptor] of previousGlobals.slice().reverse()) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
};

const assignGlobal = (name: string, value: unknown): void => {
  previousGlobals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

export const mountWidget = (element: ReactElement): void => {
  act(() => root.render(element));
};

export const clickButton = async (name: string): Promise<void> => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name,
  );
  if (!(button instanceof HTMLElement)) throw new Error(`Expected button ${name}.`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
};

/** Minimal native-service double for widget chrome tests that never send a turn. */
export const fakeWorkflowChat = (): WorkflowChatClient => ({
  baseUrl: "https://service.example",
  scopeKey: "test-scope",
  fetch: vi.fn<typeof fetch>((input) => {
    let url: string;
    if (input instanceof Request) url = input.url;
    else if (input instanceof URL) url = input.href;
    else url = input;
    const path = new URL(url).pathname;
    if (path === "/api/conversations") {
      return Promise.resolve(Response.json({ conversations: [], runningConversationIds: [] }));
    }
    if (path === "/api/models") {
      return Promise.resolve(Response.json({ models: [] }));
    }
    if (path === "/api/tools") return Promise.resolve(Response.json({ tools: [] }));
    if (path === "/api/capabilities") {
      return Promise.resolve(Response.json({ hostContext: { enabled: false } }));
    }
    if (path === "/api/activity") return Promise.resolve(createActivityResponse());
    return Promise.resolve(new Response(null, { status: 404 }));
  }),
});

const createActivityResponse = (): Response => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'event: sidechat.turn-activity-sync\ndata: {"type":"sidechat.turn-activity-sync","activeTurns":[]}\n\n',
        ),
      );
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
};
