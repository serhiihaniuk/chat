import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type {
  WorkflowActiveTurn,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import {
  createWorkflowWidgetChatSessionRegistry,
  useWorkflowWidgetChat,
  type WorkflowWidgetChat,
} from "./use-workflow-widget-chat.js";
import {
  completedTurnResponse,
  clientToolTurnResponse,
  controllableTurnResponse,
  openTurnResponse,
  requestUrl,
} from "#testing/workflow-chat/workflow-widget-chat.test-support";

const SEEDED_MESSAGE: WorkflowUIMessage = {
  id: "seed-user",
  role: "user",
  parts: [{ type: "text", text: "Earlier" }],
};

let harness: ReactDomTestHarness;

beforeEach(() => {
  harness = createReactDomTestHarness();
});

afterEach(() => {
  vi.restoreAllMocks();
  harness.cleanup();
});

describe("useWorkflowWidgetChat recovery", () => {
  it("lets a watcher replay a client-tool call without invoking or failing it", async () => {
    const dispatchToolCall = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>();
    const getCapabilities = vi.fn<NonNullable<WidgetHostBridge["getCapabilities"]>>(() =>
      Promise.resolve({
        schemaVersion: "test.capabilities.v1",
        tools: [
          {
            toolName: "open_resource",
            description: "Open a host resource.",
            inputSchema: { type: "object" },
          },
        ],
      }),
    );
    const request = vi.fn<typeof fetch>(() => Promise.resolve(clientToolTurnResponse()));
    const client = createClient(request);
    const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
    const Probe = () => {
      current.current = useWorkflowWidgetChat({
        activeTurn: { runId: "run-1", turnId: "turn-1" },
        client,
        hostBridge: { dispatchToolCall, getCapabilities },
        initialMessages: [SEEDED_MESSAGE],
        stateObservationId: "watcher-snapshot",
      });
      return null;
    };

    harness.render(createElement(Probe));
    await waitFor(() => JSON.stringify(current.current?.messages).includes("client-tool-call-1"));

    expect(request).toHaveBeenCalledTimes(1);
    expect(getCapabilities).not.toHaveBeenCalled();
    expect(dispatchToolCall).not.toHaveBeenCalled();
  });

  it("reattaches to a discovered run on cold load without duplicating seeded history", async () => {
    const urls: string[] = [];
    const request = vi.fn<typeof fetch>((input) => {
      urls.push(requestUrl(input));
      return Promise.resolve(completedTurnResponse());
    });
    const chat = renderChat({ fetch: request }, { runId: "run-1", turnId: "turn-1" });

    await waitFor(
      () => chat.current?.messages.some((message) => message.role === "assistant") ?? false,
    );

    expect(urls.some((url) => url.includes("/api/chat/run-1/stream"))).toBe(true);
    expect(chat.current?.messages.filter((message) => message.id === "seed-user")).toHaveLength(1);
    expect(chat.current?.messages.filter((message) => message.role === "assistant")).toHaveLength(
      1,
    );
  });

  it("reports reattaching before the recovered stream produces any bytes", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const chat = renderChat(
      { fetch: request },
      { runId: "run-1", turnId: "turn-1" },
      [SEEDED_MESSAGE],
      "snapshot-running",
    );

    expect(chat.current?.phase).toBe("reattaching");

    await waitFor(() => resolveResponse !== undefined);
    act(() => resolveResponse?.(completedTurnResponse()));
    await waitFor(() => chat.current?.status === "idle");
  });

  it("keeps a finished live run settling until a newer authoritative state is observed", async () => {
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const onRunReconciled = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>(() => Promise.resolve(completedTurnResponse()));
    const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
    const client = createClient(request);
    let activeTurn: WorkflowActiveTurn | undefined = { runId: "run-1", turnId: "turn-1" };
    let initialMessages: readonly WorkflowUIMessage[] = [SEEDED_MESSAGE];
    let stateObservationId = "snapshot-running";
    const Probe = () => {
      current.current = useWorkflowWidgetChat({
        activeTurn,
        client,
        initialMessages,
        lifecycle: { onRunReconciled, onRunTerminal },
        stateObservationId,
      });
      return null;
    };

    harness.render(createElement(Probe));
    await waitFor(
      () => current.current?.phase === "settling" && onRunTerminal.mock.calls.length === 1,
    );
    expect(onRunTerminal).toHaveBeenCalledWith("run-1");
    expect(onRunReconciled).not.toHaveBeenCalled();

    activeTurn = undefined;
    initialMessages = structuredClone(current.current?.messages ?? []);
    harness.render(createElement(Probe));
    expect(current.current?.phase).toBe("settling");
    expect(onRunReconciled).not.toHaveBeenCalled();

    stateObservationId = "snapshot-terminal";
    harness.render(createElement(Probe));
    await waitFor(() => onRunReconciled.mock.calls.length === 1);
    expect(current.current?.phase).toBe("idle");
    expect(onRunReconciled).toHaveBeenCalledWith("run-1");
  });

  it("lets a newer terminal snapshot replace a still-open replay without an abort terminal", async () => {
    const onRunReconciled = vi.fn<(runId: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>((_input, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Workflow replay aborted.", "AbortError"));
      }
      return Promise.resolve(openTurnResponse(init?.signal ?? undefined));
    });
    const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
    const client = createClient(request);
    let activeTurn: WorkflowActiveTurn | undefined = { runId: "run-1", turnId: "turn-1" };
    let stateObservationId = "snapshot-running";
    let initialMessages: readonly WorkflowUIMessage[] = [SEEDED_MESSAGE];
    const Probe = () => {
      current.current = useWorkflowWidgetChat({
        activeTurn,
        client,
        initialMessages,
        lifecycle: { onRunReconciled, onRunTerminal },
        stateObservationId,
      });
      return null;
    };

    harness.render(createElement(Probe));
    await waitFor(() => current.current?.phase === "streaming");

    activeTurn = undefined;
    stateObservationId = "snapshot-terminal";
    initialMessages = [
      SEEDED_MESSAGE,
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Durable answer" }],
        metadata: {
          terminal: { status: "completed", finishReason: "stop" },
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
      },
    ];
    harness.render(createElement(Probe));

    await waitFor(() => current.current?.phase === "idle");
    expect(JSON.stringify(current.current?.messages)).toContain("Durable answer");
    expect(current.current?.terminal).toMatchObject({
      kind: "completed",
      messageId: "assistant-1",
    });
    expect(onRunTerminal).toHaveBeenCalledOnce();
    expect(onRunTerminal).toHaveBeenCalledWith("run-1");
    expect(onRunReconciled).toHaveBeenCalledWith("run-1");
  });

  it("keeps a stream alive while no conversation view is subscribed, then reuses it", async () => {
    const controlled = controllableTurnResponse();
    const request = vi.fn<typeof fetch>(() => Promise.resolve(controlled.response));
    const registry = createWorkflowWidgetChatSessionRegistry();
    const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
    const client = createClient(request);
    const Probe = () => {
      current.current = useWorkflowWidgetChat({
        client,
        includeHostContext: false,
        initialMessages: [SEEDED_MESSAGE],
        lifecycle: {},
        sessionRegistry: registry,
      });
      return null;
    };

    harness.render(createElement(Probe));
    act(() => {
      void current.current?.submitMessage("Keep running");
    });
    await waitFor(
      () =>
        current.current?.messages.some((message) => JSON.stringify(message).includes("Partial")) ??
        false,
    );

    harness.render(null);
    controlled.finish();
    await act(async () => Promise.resolve());
    harness.render(createElement(Probe));
    await waitFor(() => current.current?.status === "idle");

    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(current.current?.messages)).toContain("Partial answer");
    expect(
      current.current?.messages.filter((message) => message.role === "assistant"),
    ).toHaveLength(1);
  });

  it("reconciles and prunes an inactive session after durable activity becomes terminal", async () => {
    const controlled = controllableTurnResponse();
    const durableAssistant: WorkflowUIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Durable answer" }],
      metadata: {
        terminal: { status: "completed", finishReason: "stop" },
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    };
    const request = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (init?.method === "POST") return Promise.resolve(controlled.response);
      if (url.endsWith("/state")) {
        return Promise.resolve(
          Response.json({ messages: [SEEDED_MESSAGE, durableAssistant], activeTurn: null }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const registry = createWorkflowWidgetChatSessionRegistry();
    const client = createClient(request);
    const session = registry.getOrCreate({
      client,
      includeHostContext: false,
      initialMessages: [SEEDED_MESSAGE],
      lifecycle: {},
    });

    void session.submitMessage("Keep running");
    await waitFor(() => session.getSnapshot().activeRunId === "run-1");
    controlled.finish();
    await waitFor(() => session.getSnapshot().activeEpoch === undefined);

    expect(registry.has(client)).toBe(true);
    await registry.reconcileInactiveConversation(client);

    expect(registry.has(client)).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps colliding conversation ids isolated by authenticated scope", () => {
    const request = vi.fn<typeof fetch>();
    const registry = createWorkflowWidgetChatSessionRegistry();
    const scopeAClient = createClient(request);
    const scopeBClient = { ...scopeAClient, scopeKey: "scope-b" };
    const scopeASession = registry.getOrCreate({
      client: scopeAClient,
      includeHostContext: false,
      initialMessages: [],
      lifecycle: {},
    });
    const scopeBSession = registry.getOrCreate({
      client: scopeBClient,
      includeHostContext: false,
      initialMessages: [],
      lifecycle: {},
    });

    expect(scopeBSession).not.toBe(scopeASession);
    expect(registry.has(scopeAClient)).toBe(true);
    expect(registry.has(scopeBClient)).toBe(true);

    registry.disposeAll();
  });
});

function renderChat(
  overrides: Partial<WorkflowConversationClient>,
  activeTurn?: WorkflowActiveTurn,
  initialMessages: readonly WorkflowUIMessage[] = [SEEDED_MESSAGE],
  stateObservationId?: string,
) {
  const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
  const client: WorkflowConversationClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    ...overrides,
    scopeKey: overrides.scopeKey ?? "test-scope",
  };
  const Probe = () => {
    current.current = useWorkflowWidgetChat({
      activeTurn,
      client,
      initialMessages,
      stateObservationId,
    });
    return null;
  };
  harness.render(createElement(Probe));
  return current;
}

function createClient(request: typeof fetch): WorkflowConversationClient {
  return {
    baseUrl: "https://service.example",
    scopeKey: "test-scope",
    conversationId: "conversation-1",
    fetch: request,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    // The production drain yields with a zero-delay timer between bounded
    // replay slices. Yield a macrotask here as well so this poller does not
    // starve the behavior it is waiting to observe.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error("Timed out waiting for chat state.");
}
