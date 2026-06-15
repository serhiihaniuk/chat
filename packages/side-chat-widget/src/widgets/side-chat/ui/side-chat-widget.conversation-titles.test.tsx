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
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

describe("SideChatWidget conversation titles", () => {
  it("uses the first submitted message as the new chat title until the list refreshes", async () => {
    const client = fakeClient(async function* () {
      await Promise.resolve();
      yield started("conversation-new");
      yield delta("fallback title response");
      yield completed();
    });

    renderWidget(client);
    await submit("pricing rollout risks");

    await waitForConversationTitle("pricing rollout risks");
    expect(selectedConversationTitle()).toBe("pricing rollout risks");
  });

  it("unblocks chat on the terminal event before the stream iterator closes", async () => {
    const streamClosed = createDeferred<void>();
    const client = fakeClient(async function* () {
      yield started();
      yield delta("terminal response");
      yield completed();
      await streamClosed.promise;
    });

    renderWidget(client);
    await submit("slow title generation");
    await waitForSendEnabled();

    expect(sendButton().disabled).toBe(false);

    await act(async () => {
      streamClosed.resolve();
      await Promise.resolve();
    });
  });

  it("replaces the first-message title after the normal list refresh returns a generated title", async () => {
    let listCallCount = 0;
    const listConversations = vi.fn<NonNullable<ChatClient["listConversations"]>>(() => {
      listCallCount += 1;
      return Promise.resolve({
        conversations: conversationSummariesForTitleRefresh(listCallCount),
      });
    });
    const client = fakeClient(
      async function* () {
        await Promise.resolve();
        yield started();
        yield delta("generated title response");
        yield completed();
      },
      { listConversations },
    );

    renderWidget(client);
    await submit("first fallback title");

    await waitForConversationTitle("Generated title");
    expect(selectedConversationTitle()).toBe("Generated title");
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

const sendButton = (): HTMLButtonElement => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === "Send",
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error("Expected send button.");
  return button;
};

const waitForConversationTitle = async (title: string): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const trigger = document.querySelector('[aria-label="Select chat"]');
    if (trigger?.getAttribute("title") === title || trigger?.textContent?.includes(title)) {
      return;
    }
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error(`Expected selected chat title to be ${title}.`);
};

const selectedConversationTitle = (): string | undefined => {
  const trigger = document.querySelector('[aria-label="Select chat"]');
  return trigger?.getAttribute("title") ?? trigger?.textContent?.trim();
};

const waitForSendEnabled = async (): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!sendButton().disabled) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error("Expected send button to be enabled.");
};

const fakeClient = (
  createEvents: (
    request: ChatStreamRequest,
  ) => AsyncIterable<SidechatStreamEvent> | Promise<AsyncIterable<SidechatStreamEvent>>,
  overrides: Partial<Pick<ChatClient, "listConversations">> = {},
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

const conversationSummary = (conversationId: string, title: string): ConversationSummary => ({
  conversationId,
  title,
  status: "active",
  createdAt: "2026-05-23T13:00:00.000Z",
  updatedAt: "2026-05-23T13:00:00.000Z",
  lastMessageAt: "2026-05-23T13:00:00.000Z",
});

const conversationSummariesForTitleRefresh = (
  listCallCount: number,
): readonly ConversationSummary[] => {
  if (listCallCount === 1) return [];
  if (listCallCount === 2) return [conversationSummary("conversation-1", "first fallback title")];
  return [conversationSummary("conversation-1", "Generated title")];
};

const createDeferred = <Value,>() => {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};
