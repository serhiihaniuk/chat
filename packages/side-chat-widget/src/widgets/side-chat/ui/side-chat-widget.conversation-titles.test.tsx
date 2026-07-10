import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { SideChatWidget } from "./side-chat-widget.js";
import type { ConversationSummary, SideChatApiClient } from "#entities/conversation";
import {
  completed,
  conversationSummary,
  delta,
  fakeClient,
  installWidgetTestDom,
  mountWidget,
  started,
} from "./widget-test-env.js";

installWidgetTestDom();

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
    const listConversations = vi.fn<NonNullable<SideChatApiClient["listConversations"]>>(() => {
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

const renderWidget = (client: SideChatApiClient) => {
  mountWidget(
    <SideChatWidget
      turnProfiles={[{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }]}
      client={client}
      conversationStorageKey="widget-chat-store"
      defaultTurnProfileId="gpt-5.4-mini"
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
    />,
  );
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

const conversationSummariesForTitleRefresh = (
  listCallCount: number,
): readonly ConversationSummary[] => {
  if (listCallCount === 1) return [];
  if (listCallCount === 2) return [conversationSummary("conversation-1", "first fallback title")];
  return [conversationSummary("conversation-1", "Generated title")];
};

const createDeferred = <Value,>() => {
  const deferred: { resolve?: (value: Value | PromiseLike<Value>) => void } = {};
  const promise = new Promise<Value>((resolver) => {
    deferred.resolve = resolver;
  });
  const resolve = deferred.resolve;
  if (!resolve) throw new Error("Deferred promise did not initialize its resolver.");
  return { promise, resolve };
};
