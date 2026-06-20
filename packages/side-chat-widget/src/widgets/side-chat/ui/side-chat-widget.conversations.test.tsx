import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { describe, expect, it, vi } from "vitest";

import type { SideChatApiClient } from "#entities/conversation";
import { SideChatWidget } from "./side-chat-widget.js";
import {
  clickButton,
  completed,
  conversationSummary,
  delta,
  fakeClient,
  installWidgetTestDom,
  mountWidget,
  started,
  submit,
  waitForText,
} from "./widget-test-env.js";

installWidgetTestDom();

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
    const readHistory = vi.fn<NonNullable<SideChatApiClient["readHistory"]>>((conversationId) =>
      Promise.resolve({
        conversationId,
        messages: selectedConversationMessages(requests.length > 0),
      }),
    );
    const listConversations = vi.fn<NonNullable<SideChatApiClient["listConversations"]>>(() =>
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

  it("loads server conversations immediately when the browser store is empty", async () => {
    const listConversations = vi.fn<NonNullable<SideChatApiClient["listConversations"]>>(() =>
      Promise.resolve({
        conversations: [conversationSummary("conversation-1", "Seeded demo chat")],
      }),
    );
    const client = fakeClient(
      async function* () {
        await Promise.resolve();
        yield started();
        yield completed();
      },
      { listConversations },
    );

    renderWidget(client);
    await waitForText("Seeded demo chat");

    expect(listConversations).toHaveBeenCalled();
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

  it("does not refetch history for a conversation a stream just established", async () => {
    // Regression net for the history-clobber bug: a stream-owned conversation
    // already has its live messages in state, so the history effect must not
    // refetch it on the streaming -> idle transition and replace streamed text.
    const readHistory = vi.fn<NonNullable<SideChatApiClient["readHistory"]>>((conversationId) =>
      Promise.resolve({ conversationId, messages: [] }),
    );
    const client = fakeClient(
      async function* () {
        await Promise.resolve();
        yield started("conversation-1");
        yield delta("streamed answer");
        yield completed();
      },
      { readHistory, listConversations: () => Promise.resolve({ conversations: [] }) },
    );

    renderWidget(client);
    await submit("first message");
    await waitForText("streamed answer");
    // Flush any post-completion effects (the streaming -> idle transition).
    await waitForText("streamed answer");

    expect(readHistory).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("streamed answer");
  });
});

const renderWidget = (client: SideChatApiClient) =>
  mountWidget(
    <SideChatWidget
      turnProfiles={[{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }]}
      client={client}
      conversationStorageKey="widget-chat-store"
      defaultTurnProfileId="gpt-5.4-mini"
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
    />,
  );

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
