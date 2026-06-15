import type { ChatClient, ConversationSummary } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SideChatWidget } from "./side-chat-widget.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;
let previousGlobals: [string, PropertyDescriptor | undefined][];

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
  assignGlobal("MouseEvent", windowRef.MouseEvent);
  assignGlobal("Event", windowRef.Event);
  assignGlobal("FormData", windowRef.FormData);
  assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
  assignGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

const assignGlobal = (name: string, value: unknown): void => {
  previousGlobals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

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

describe("SideChatWidget conversation history", () => {
  it("sends the server conversation id on subsequent chat requests", async () => {
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(async function* (request) {
      await Promise.resolve();
      requests.push(request);
      yield started();
      yield delta(`response ${requests.length}`);
      yield completed();
    });

    renderWidget(client);
    await submit("first message");
    await waitForText("response 1");
    await submit("second message");
    await waitForText("response 2");

    expect(requests[0]?.conversationId).toBeUndefined();
    expect(requests[1]?.conversationId).toBe("conversation-1");
  });

  it("hydrates a stored chat and continues the selected conversation", async () => {
    window.localStorage.setItem(
      "widget-chat-store",
      JSON.stringify({ activeConversationId: "conversation-2", conversations: [] }),
    );
    const requests: ChatStreamRequest[] = [];
    const readHistory = vi.fn<NonNullable<ChatClient["readHistory"]>>((conversationId) =>
      Promise.resolve({
        conversationId,
        messages: selectedConversationMessages(requests.length > 0),
      }),
    );
    const listConversations = vi.fn<NonNullable<ChatClient["listConversations"]>>(() =>
      Promise.resolve({
        conversations: [
          conversationSummary("conversation-1", "First chat"),
          conversationSummary("conversation-2", "Selected chat"),
        ],
      }),
    );
    const client = fakeClient(
      async function* (request) {
        await Promise.resolve();
        requests.push(request);
        yield started("conversation-2");
        yield delta("continued");
        yield completed();
      },
      { listConversations, readHistory },
    );

    renderWidget(client);
    await waitForText("selected answer");
    await submit("continue here");
    await waitForText("continued");

    expect(readHistory).toHaveBeenCalledWith("conversation-2", expect.any(Object));
    expect(listConversations).toHaveBeenCalled();
    expect(requests[0]?.conversationId).toBe("conversation-2");
  });

  it("starts a fresh chat from a selected conversation", async () => {
    window.localStorage.setItem(
      "widget-chat-store",
      JSON.stringify({ activeConversationId: "conversation-1", conversations: [] }),
    );
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(
      async function* (request) {
        await Promise.resolve();
        requests.push(request);
        yield started("conversation-3");
        yield delta("fresh response");
        yield completed();
      },
      {
        listConversations: () =>
          Promise.resolve({ conversations: [conversationSummary("conversation-1", "Old chat")] }),
        readHistory: (conversationId) =>
          Promise.resolve({
            conversationId,
            messages:
              conversationId === "conversation-3"
                ? freshConversationMessages
                : [{ id: "history-user-1", role: "user", content: "old question", sequence: 0 }],
          }),
      },
    );

    renderWidget(client);
    await waitForText("old question");
    await clickButton("Start new chat");
    await submit("new topic");
    await waitForText("fresh response");

    expect(requests[0]?.conversationId).toBeUndefined();
  });
});

const renderWidget = (client: ChatClient) => {
  act(() => {
    root.render(
      <SideChatWidget
        assistantProfiles={[{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }]}
        client={client}
        conversationStorageKey="widget-chat-store"
        defaultAssistantProfileId="gpt-5.4-mini"
        labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
      />,
    );
  });
};

const submit = async (message: string) => {
  const textarea = document.querySelector("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Expected textarea.");

  act(() => {
    textarea.value = message;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickButton("Send");
};

const clickButton = async (name: string) => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name,
  );
  if (!(button instanceof HTMLElement)) throw new Error(`Expected button ${name}.`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
};

const waitForText = async (text: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error(`Expected document text to include ${text}.`);
};

const fakeClient = (
  createEvents: (
    request: ChatStreamRequest,
  ) => AsyncIterable<SidechatStreamEvent> | Promise<AsyncIterable<SidechatStreamEvent>>,
  overrides: Partial<Pick<ChatClient, "listConversations" | "readHistory">> = {},
): ChatClient => ({
  ...overrides,
  streamChat: async (request) => ({
    attempt: 1,
    events: await createEvents(request),
  }),
});

const baseEvent = (sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `event-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T13:00:00.000Z",
});

const started = (conversationId = "conversation-1"): StartedEvent => ({
  ...baseEvent(0),
  type: "sidechat.started",
  conversationId,
});

const delta = (content: string): DeltaEvent => ({
  ...baseEvent(1),
  type: "sidechat.delta",
  content,
});

const completed = (): CompletedEvent => ({
  ...baseEvent(2),
  type: "sidechat.completed",
  finishReason: "stop",
});

const selectedConversationMessages = (includeContinuation: boolean) => [
  { id: "history-user-1", role: "user" as const, content: "selected question", sequence: 0 },
  {
    id: "history-assistant-1",
    role: "assistant" as const,
    content: "selected answer",
    sequence: 1,
  },
  ...(includeContinuation ? continuedConversationMessages : []),
];

const continuedConversationMessages = [
  { id: "history-user-2", role: "user" as const, content: "continue here", sequence: 2 },
  {
    id: "history-assistant-2",
    role: "assistant" as const,
    content: "continued",
    sequence: 3,
  },
];

const freshConversationMessages = [
  { id: "history-user-2", role: "user" as const, content: "new topic", sequence: 2 },
  {
    id: "history-assistant-2",
    role: "assistant" as const,
    content: "fresh response",
    sequence: 3,
  },
];

const conversationSummary = (conversationId: string, title: string): ConversationSummary => ({
  conversationId,
  title,
  status: "active",
  createdAt: "2026-05-23T13:00:00.000Z",
  updatedAt: "2026-05-23T13:00:00.000Z",
  lastMessageAt: "2026-05-23T13:00:00.000Z",
});
