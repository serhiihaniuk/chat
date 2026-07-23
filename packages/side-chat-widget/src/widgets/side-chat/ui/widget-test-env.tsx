import { act, type ReactElement } from "react";
import { afterEach, beforeEach, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";

let harness: ReactDomTestHarness;

/** Install the browser globals required by full-widget DOM tests. */
export const installWidgetTestDom = (): void => {
  beforeEach(() => {
    harness = createReactDomTestHarness();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    harness.cleanup();
  });
};

export const mountWidget = (element: ReactElement): void => {
  harness.render(element);
};

export const waitForWidgetDom = (
  predicate: () => boolean,
  failureMessage?: string,
): Promise<void> => harness.waitFor(predicate, failureMessage);

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
