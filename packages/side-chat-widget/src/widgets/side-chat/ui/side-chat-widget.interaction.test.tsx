import type { ChatClient } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ActivityEvent,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
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
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });
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

describe("SideChatWidget interactions", () => {
  it("submits a message through the chat-client seam and renders streaming deltas", async () => {
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(async function* (request) {
      await Promise.resolve();
      requests.push(request);
      yield started();
      yield delta("Hello ");
      yield delta("from the widget");
      yield completed();
    });

    renderWidget(client);
    await submit("hello widget");

    await waitForText("Hello from the widget");
    expect(requests[0]).toMatchObject({
      assistantProfileId: "gpt-5.4-mini",
      message: { content: "hello widget", role: "user" },
    });
  });

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

  it("shows and dismisses a visible error when the chat client rejects", async () => {
    const client = fakeClient(() => Promise.reject(new Error("stream exploded")));

    renderWidget(client);
    await submit("please fail");

    await waitForText("stream exploded");
    await clickButton("Dismiss error");
    expect(document.body.textContent).not.toContain("stream exploded");
  });

  it("dispatches host-command activity through the host bridge and renders the local result", async () => {
    let dispatchCount = 0;
    const dispatchCommandImpl: NonNullable<HostBridge["dispatchCommand"]> = () => {
      dispatchCount += 1;
      return Promise.resolve({
        commandId: "host-command-1",
        commandName: "open_resource",
        status: "applied",
        resultCode: "component_test_applied",
        resolvedAt: "2026-05-23T13:00:00.000Z",
      });
    };
    const client = fakeClient(async function* () {
      await Promise.resolve();
      yield started();
      yield hostCommandActivity();
      yield completed();
    });

    renderWidget(client, {
      dispatchCommand: dispatchCommandImpl,
      getContext: () =>
        Promise.resolve({
          schemaVersion: "test.host-context.v1",
          collectedAt: "2026-05-23T13:00:00.000Z",
        }),
    });
    await submit("open record");

    await waitForText("component_test_applied");
    expect(dispatchCount).toBe(1);
  });

  it("aborts the active request from the stop control", async () => {
    const observedSignals: AbortSignal[] = [];
    const client: ChatClient = {
      streamChat: (_request, options) => {
        if (options?.signal) observedSignals.push(options.signal);
        return Promise.resolve({
          attempt: 1,
          events: neverEndingEvents(),
        });
      },
    };

    renderWidget(client);
    await submit("keep streaming");
    await waitForText("keep streaming");
    await clickButton("Send");

    expect(observedSignals[0]?.aborted).toBe(true);
  });
});

const renderWidget = (
  client: ChatClient,
  hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">,
) => {
  act(() => {
    const props = {
      assistantProfiles: [{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }],
      client,
      defaultAssistantProfileId: "gpt-5.4-mini",
      labels: { placeholder: "Message", send: "Send", title: "Workspace Assistant" },
      ...(hostBridge ? { hostBridge } : {}),
    } satisfies Parameters<typeof SideChatWidget>[0];
    root.render(<SideChatWidget {...props} />);
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
): ChatClient => ({
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

const started = (): StartedEvent => ({
  ...baseEvent(0),
  type: "sidechat.started",
  conversationId: "conversation-1",
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

const hostCommandActivity = (): ActivityEvent => ({
  ...baseEvent(1),
  type: "sidechat.activity",
  activityId: "host-command-1",
  activityKind: "host_command",
  status: "running",
  title: "Open resource",
  details: {
    hostCommand: {
      commandId: "host-command-1",
      commandName: "open_resource",
      payload: { resourceId: "record-1" },
    },
  },
});

const neverEndingEvents = async function* (): AsyncIterable<SidechatStreamEvent> {
  yield started();
  yield delta("still streaming");
  await new Promise(() => undefined);
};
