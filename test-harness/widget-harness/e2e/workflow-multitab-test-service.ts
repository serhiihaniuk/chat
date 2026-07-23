/**
 * Stateful HTTP/SSE fixture for multitab and iframe browser contracts.
 *
 * It deliberately models only browser-visible service behavior: shared activity,
 * replay attachment, one conflict, and capability-bound client-tool output. Test
 * control endpoints are local-only and drive deterministic completion.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  SIDE_CHAT_CLIENT_TOOL_CAPABILITY,
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  TURN_ACTIVITY_EVENT_TYPE,
  TURN_ACTIVITY_STATUS,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityStatus,
} from "@side-chat/stream-profile";

const PORT = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const RUN_ID = "run-multitab";
const TURN_ID = "turn-multitab";
const ASSISTANT_MESSAGE_ID = "assistant-multitab";
const TEXT_PART_ID = "text-multitab";
const PARTIAL_ANSWER = "Both tabs receive the shared";
const COMPLETE_ANSWER = `${PARTIAL_ANSWER} workflow answer.`;
const REFERENCE_CONVERSATION_ID = "conversation-reference";
const REFERENCE_PROMPT = "Show the reference conversation";
const REFERENCE_ANSWER = "Reference conversation history.";
const CONFLICT_CONVERSATION_ID = "conversation-conflict";
const CONFLICT_PROMPT = "Earlier conflict conversation";
const CONFLICT_ANSWER = "Conflict conversation history.";
// Exact prompt sentinel that selects the iframe client-tool scenario.
const IFRAME_CLIENT_TOOL_PROMPT = "iframe client tool contract";
const MULTITAB_CLIENT_TOOL_PROMPT = "multitab client tool contract";
const CLIENT_TOOL_CALL_ID = "call-iframe-open-resource";

type StreamChunk = Readonly<Record<string, unknown>>;
type FixtureCounters = {
  cancelRequests: number;
  chatAccepted: number;
  chatConflicts: number;
  clientToolOutputs: number;
  conversations: number;
  models: number;
  replayConnections: number;
  state: number;
  tools: number;
};
type PendingClientToolOutput = {
  readonly body: Record<string, unknown>;
  readonly response: ServerResponse;
};
type FixtureState = {
  activitySubscribers: Set<ServerResponse>;
  cancelled: boolean;
  clientToolCapabilities: string[];
  clientToolOutputDeferred: boolean;
  clientToolOutput: Record<string, unknown> | undefined;
  completed: boolean;
  conversationId: string | undefined;
  pendingClientToolOutput: PendingClientToolOutput | undefined;
  prompt: string;
  running: boolean;
  subscribers: Set<ServerResponse>;
  toolMode: boolean;
  counters: FixtureCounters;
};

const partialChunks = [
  { type: "start", messageId: ASSISTANT_MESSAGE_ID },
  { type: "start-step" },
  { type: "text-start", id: TEXT_PART_ID },
  { type: "text-delta", id: TEXT_PART_ID, delta: PARTIAL_ANSWER },
];
const terminalChunks = [
  { type: "text-delta", id: TEXT_PART_ID, delta: " workflow answer." },
  { type: "text-end", id: TEXT_PART_ID },
  { type: "finish-step" },
  { type: "finish" },
];
const cancelledChunks = [{ type: "abort" }];
const emptyUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as const;

let state = createState();

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (handleTestControl(request, response, url)) return;
  if (handleCatalogRead(request, response, url)) return;
  if (handleConversationRead(request, response, url)) return;
  if (request.method === "GET" && url.pathname === "/api/activity") {
    openActivityStream(response);
    return;
  }
  if (await handleChatRequest(request, response, url)) return;
  json(response, 404, { error: "not_found" });
}

async function handleChatRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (request.method === "POST" && url.pathname === "/api/chat") {
    await startChat(request, response);
    return true;
  }
  if (
    request.method === "POST" &&
    url.pathname === `/api/chat/${RUN_ID}/tools/${CLIENT_TOOL_CALL_ID}/output`
  ) {
    await acceptClientToolOutput(request, response);
    return true;
  }
  if (request.method === "POST" && url.pathname === `/api/chat/${RUN_ID}/cancel`) {
    cancelRun(response);
    return true;
  }
  if (request.method === "GET" && url.pathname === `/api/chat/${RUN_ID}/stream`) {
    state.counters.replayConnections += 1;
    openStream(response, false);
    return true;
  }
  return false;
}

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`workflow multitab fixture listening on ${PORT}\n`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));

function createState(): FixtureState {
  return {
    activitySubscribers: new Set(),
    cancelled: false,
    clientToolCapabilities: [],
    clientToolOutputDeferred: false,
    clientToolOutput: undefined,
    completed: false,
    conversationId: undefined,
    pendingClientToolOutput: undefined,
    prompt: "",
    running: false,
    subscribers: new Set(),
    toolMode: false,
    counters: {
      cancelRequests: 0,
      chatAccepted: 0,
      chatConflicts: 0,
      clientToolOutputs: 0,
      conversations: 0,
      models: 0,
      replayConnections: 0,
      state: 0,
      tools: 0,
    },
  };
}

type TestControlHandler = (response: ServerResponse) => void;

const TEST_CONTROL_HANDLERS: Readonly<Record<string, TestControlHandler>> = {
  "GET /__test/health": (response) => json(response, 200, { ok: true }),
  "GET /__test/state": (response) => json(response, 200, publicState()),
  "POST /__test/reset": resetFixture,
  "POST /__test/defer-client-tool-output": (response) => {
    state.clientToolOutputDeferred = true;
    json(response, 200, { deferred: true });
  },
  "POST /__test/release-client-tool-output": (response) => {
    releasePendingClientToolOutput();
    json(response, 200, { released: true });
  },
  "POST /__test/complete": (response) => {
    completeRun();
    json(response, 200, { completed: true });
  },
};

function handleTestControl(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  const handler = TEST_CONTROL_HANDLERS[`${request.method ?? ""} ${url.pathname}`];
  if (handler === undefined) return false;
  handler(response);
  return true;
}

function resetFixture(response: ServerResponse): void {
  closeSubscribers();
  closeActivitySubscribers();
  closePendingClientToolOutput();
  state = createState();
  json(response, 200, { reset: true });
}

function handleCatalogRead(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (url.pathname === "/api/capabilities") {
    json(response, 200, { hostContext: { enabled: true } });
    return true;
  }
  if (url.pathname === "/api/conversations") {
    state.counters.conversations += 1;
    const conversations = [
      ...(state.conversationId && state.conversationId !== CONFLICT_CONVERSATION_ID
        ? [
            {
              id: state.conversationId,
              status: "active",
              title: "Shared running chat",
              lastMessageAt: "2026-07-14T12:00:00Z",
            },
          ]
        : []),
      {
        id: REFERENCE_CONVERSATION_ID,
        status: "active",
        title: "Reference chat",
        lastMessageAt: "2026-07-13T12:00:00Z",
      },
      {
        id: CONFLICT_CONVERSATION_ID,
        status: "active",
        title: "Conflict chat",
        lastMessageAt: "2026-07-12T12:00:00Z",
      },
    ];
    json(response, 200, {
      conversations,
      runningConversationIds: state.running && state.conversationId ? [state.conversationId] : [],
    });
    return true;
  }
  if (url.pathname === "/api/models") {
    state.counters.models += 1;
    json(response, 200, {
      models: [{ id: "complete", provider: "scripted", contextWindowTokens: 16_000 }],
      defaultModelId: "complete",
    });
    return true;
  }
  if (url.pathname === "/api/tools") {
    state.counters.tools += 1;
    json(response, 200, { tools: [] });
    return true;
  }
  return false;
}

function handleConversationRead(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): boolean {
  if (request.method !== "GET") return false;
  const payload = readConversationStatePayload(url.pathname);
  if (payload === undefined) return false;
  state.counters.state += 1;
  json(response, 200, payload);
  return true;
}

function readConversationStatePayload(pathname: string): Record<string, unknown> | undefined {
  const current = readCurrentConversationState(pathname);
  if (current !== undefined) return current;
  return STATIC_CONVERSATION_STATES[pathname];
}

function readCurrentConversationState(pathname: string): Record<string, unknown> | undefined {
  if (!state.conversationId) return undefined;
  const statePath = `/api/conversations/${encodeURIComponent(state.conversationId)}/state`;
  if (pathname !== statePath) return undefined;
  return {
    messages: currentConversationMessages(),
    activeTurn: state.running ? { turnId: TURN_ID, runId: RUN_ID, status: "running" } : null,
  };
}

function currentConversationMessages(): unknown[] {
  const messages: unknown[] = [
    { id: "user-multitab", role: "user", parts: [{ type: "text", text: state.prompt }] },
  ];
  const assistantMessage = currentAssistantMessage();
  if (assistantMessage !== undefined) messages.push(assistantMessage);
  return messages;
}

function currentAssistantMessage(): Record<string, unknown> | undefined {
  if (state.toolMode) {
    const output = state.clientToolOutput?.["output"];
    return {
      id: ASSISTANT_MESSAGE_ID,
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: CLIENT_TOOL_CALL_ID,
          toolName: "open_resource",
          state: output === undefined ? "input-available" : "output-available",
          input: { resourceType: "ticket", resourceId: "ticket-4821" },
          ...(output === undefined ? {} : { output }),
        },
      ],
    };
  }
  if (state.cancelled) {
    return {
      id: ASSISTANT_MESSAGE_ID,
      role: "assistant",
      parts: [{ type: "text", text: PARTIAL_ANSWER }],
      metadata: { usage: emptyUsage, terminal: { status: "cancelled" } },
    };
  }
  if (!state.completed) return undefined;
  return {
    id: ASSISTANT_MESSAGE_ID,
    role: "assistant",
    parts: [{ type: "text", text: COMPLETE_ANSWER }],
  };
}

const STATIC_CONVERSATION_STATES: Readonly<Record<string, Record<string, unknown>>> = {
  [`/api/conversations/${REFERENCE_CONVERSATION_ID}/state`]: {
    activeTurn: null,
    messages: [
      { id: "user-reference", role: "user", parts: [{ type: "text", text: REFERENCE_PROMPT }] },
      {
        id: "assistant-reference",
        role: "assistant",
        parts: [{ type: "text", text: REFERENCE_ANSWER }],
      },
    ],
  },
  [`/api/conversations/${CONFLICT_CONVERSATION_ID}/state`]: {
    activeTurn: null,
    messages: [
      { id: "user-conflict", role: "user", parts: [{ type: "text", text: CONFLICT_PROMPT }] },
      {
        id: "assistant-conflict",
        role: "assistant",
        parts: [{ type: "text", text: CONFLICT_ANSWER }],
      },
    ],
  },
};

async function startChat(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  const conversationId = body["conversationId"];
  if (state.running && conversationId === state.conversationId) {
    state.counters.chatConflicts += 1;
    const conflict = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.CONFLICT];
    json(response, 409, {
      code: SIDE_CHAT_ERROR_CODES.CONFLICT,
      message: conflict.safeMessage,
      retryable: conflict.retryable,
    });
    return;
  }
  state.counters.chatAccepted += 1;
  state.conversationId = typeof conversationId === "string" ? conversationId : undefined;
  state.prompt = readPrompt(body["messages"]);
  state.toolMode =
    state.prompt === IFRAME_CLIENT_TOOL_PROMPT || state.prompt === MULTITAB_CLIENT_TOOL_PROMPT;
  state.cancelled = false;
  state.completed = false;
  state.clientToolOutput = undefined;
  recordClientToolCapability(request);
  state.running = true;
  // The conflict fixture deliberately withholds the cross-tab running event so
  // the losing tab can prove its bounded 409 presentation before reconciliation.
  if (state.conversationId !== CONFLICT_CONVERSATION_ID) {
    publishActivity(TURN_ACTIVITY_STATUS.RUNNING);
  }
  openStream(response, true);
}

function openActivityStream(response: ServerResponse): void {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream",
  });
  response.write(
    `data: ${JSON.stringify({
      type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
      activeTurns:
        state.running && state.conversationId
          ? [{ conversationId: state.conversationId, assistantTurnId: TURN_ID }]
          : [],
    })}\n\n`,
  );
  state.activitySubscribers.add(response);
  response.on("close", () => state.activitySubscribers.delete(response));
}

/**
 * Open the fixture stream. Client-tool turns finish immediately after emitting
 * the call; text turns stay subscribed until `/__test/complete` closes the run.
 */
function openStream(response: ServerResponse, includeRunHeader: boolean): void {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream",
    ...(includeRunHeader ? { "x-workflow-run-id": RUN_ID } : {}),
    "x-vercel-ai-ui-message-stream": "v1",
  });
  if (state.toolMode) {
    const toolChunks = [
      { type: "start", messageId: ASSISTANT_MESSAGE_ID },
      { type: "start-step" },
      {
        type: "tool-input-available",
        dynamic: true,
        toolCallId: CLIENT_TOOL_CALL_ID,
        toolName: "open_resource",
        input: { resourceType: "ticket", resourceId: "ticket-4821" },
      },
      { type: "finish-step" },
      { type: "finish" },
    ];
    for (const chunk of toolChunks) writeChunk(response, chunk);
    response.end("data: [DONE]\n\n");
    return;
  }
  for (const chunk of partialChunks) writeChunk(response, chunk);
  if (state.cancelled) {
    for (const chunk of cancelledChunks) writeChunk(response, chunk);
    response.end("data: [DONE]\n\n");
    return;
  }
  if (state.completed) {
    for (const chunk of terminalChunks) writeChunk(response, chunk);
    response.end("data: [DONE]\n\n");
    return;
  }
  state.subscribers.add(response);
  response.on("close", () => state.subscribers.delete(response));
}

function completeRun(): void {
  state.completed = true;
  state.cancelled = false;
  state.running = false;
  publishActivity(TURN_ACTIVITY_STATUS.TERMINAL);
  for (const response of state.subscribers) {
    for (const chunk of terminalChunks) writeChunk(response, chunk);
    response.end("data: [DONE]\n\n");
  }
  state.subscribers.clear();
}

async function acceptClientToolOutput(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readJson(request);
  recordClientToolCapability(request);
  if (state.pendingClientToolOutput || state.clientToolOutput !== undefined) {
    json(response, 200, { accepted: true, duplicate: true });
    return;
  }
  state.counters.clientToolOutputs += 1;
  if (state.clientToolOutputDeferred) {
    state.pendingClientToolOutput = { body, response };
    return;
  }
  commitClientToolOutput(body);
  json(response, 200, { accepted: true });
}

function commitClientToolOutput(body: Record<string, unknown>): void {
  state.clientToolOutput = body;
  state.completed = true;
  state.cancelled = false;
  state.running = false;
  publishActivity(TURN_ACTIVITY_STATUS.TERMINAL);
}

function releasePendingClientToolOutput(): void {
  const pending = state.pendingClientToolOutput;
  if (!pending) return;
  state.pendingClientToolOutput = undefined;
  commitClientToolOutput(pending.body);
  json(pending.response, 200, { accepted: true });
}

function closePendingClientToolOutput(): void {
  const pending = state.pendingClientToolOutput;
  if (!pending) return;
  state.pendingClientToolOutput = undefined;
  json(pending.response, 409, { error: "reset" });
}

function cancelRun(response: ServerResponse): void {
  state.counters.cancelRequests += 1;
  state.cancelled = true;
  state.completed = false;
  state.running = false;
  publishActivity(TURN_ACTIVITY_STATUS.TERMINAL);
  for (const subscriber of state.subscribers) {
    for (const chunk of cancelledChunks) writeChunk(subscriber, chunk);
    subscriber.end("data: [DONE]\n\n");
  }
  state.subscribers.clear();
  json(response, 200, { cancelled: true, runId: RUN_ID });
}

function recordClientToolCapability(request: IncomingMessage): void {
  const capability = request.headers[SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEADER];
  if (typeof capability === "string") state.clientToolCapabilities.push(capability);
}

function closeSubscribers(): void {
  for (const response of state.subscribers) response.end("data: [DONE]\n\n");
  state.subscribers.clear();
}

function closeActivitySubscribers(): void {
  for (const response of state.activitySubscribers) response.end();
  state.activitySubscribers.clear();
}

function publishActivity(status: TurnActivityStatus): void {
  for (const response of state.activitySubscribers) publishActivityTo(response, status);
}

function publishActivityTo(response: ServerResponse, status: TurnActivityStatus): void {
  if (!state.conversationId) return;
  writeChunk(response, {
    type: TURN_ACTIVITY_EVENT_TYPE,
    assistantTurnId: TURN_ID,
    conversationId: state.conversationId,
    status,
  });
}

function publicState(): Readonly<Record<string, unknown>> {
  return {
    activitySubscribers: state.activitySubscribers.size,
    cancelled: state.cancelled,
    clientToolCapabilities: state.clientToolCapabilities,
    clientToolOutputDeferred: state.clientToolOutputDeferred,
    clientToolOutput: state.clientToolOutput,
    completed: state.completed,
    conversationId: state.conversationId,
    counters: state.counters,
    pendingClientToolOutput: state.pendingClientToolOutput !== undefined,
    running: state.running,
    subscribers: state.subscribers.size,
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) {
    if (typeof chunk === "string") body += chunk;
  }
  const value: unknown = JSON.parse(body || "{}");
  return isRecord(value) ? value : {};
}

function readPrompt(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message: unknown = messages[index];
    if (!isRecord(message) || message["role"] !== "user") continue;
    const text = readFirstTextPart(message["parts"]);
    if (text !== undefined) return text;
  }
  return "";
}

function readFirstTextPart(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) return undefined;
  for (const part of parts) {
    if (!isRecord(part) || part["type"] !== "text") continue;
    const text = part["text"];
    if (typeof text === "string") return text;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeChunk(response: ServerResponse, chunk: StreamChunk): void {
  response.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
