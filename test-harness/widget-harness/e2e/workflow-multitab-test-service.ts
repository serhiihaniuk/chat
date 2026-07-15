import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  TURN_ACTIVITY_EVENT_TYPE,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityEvent,
} from "@side-chat/chat-protocol";
import { SIDE_CHAT_ERROR_CODES, SIDE_CHAT_ERROR_VOCABULARY } from "@side-chat/stream-profile";

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

type StreamChunk = Readonly<Record<string, unknown>>;
type FixtureCounters = {
  chatAccepted: number;
  chatConflicts: number;
  conversations: number;
  models: number;
  replayConnections: number;
  state: number;
  tools: number;
};
type FixtureState = {
  activitySubscribers: Set<ServerResponse>;
  completed: boolean;
  conversationId: string | undefined;
  prompt: string;
  running: boolean;
  subscribers: Set<ServerResponse>;
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
  if (request.method === "POST" && url.pathname === "/api/chat") {
    await startChat(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === `/api/chat/${RUN_ID}/stream`) {
    state.counters.replayConnections += 1;
    openStream(response, false);
    return;
  }
  json(response, 404, { error: "not_found" });
}

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`workflow multitab fixture listening on ${PORT}\n`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));

function createState(): FixtureState {
  return {
    activitySubscribers: new Set(),
    completed: false,
    conversationId: undefined,
    prompt: "",
    running: false,
    subscribers: new Set(),
    counters: {
      chatAccepted: 0,
      chatConflicts: 0,
      conversations: 0,
      models: 0,
      replayConnections: 0,
      state: 0,
      tools: 0,
    },
  };
}

function handleTestControl(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  if (request.method === "GET" && url.pathname === "/__test/health") {
    json(response, 200, { ok: true });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__test/state") {
    json(response, 200, publicState());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    closeSubscribers();
    closeActivitySubscribers();
    state = createState();
    json(response, 200, { reset: true });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/__test/complete") {
    completeRun();
    json(response, 200, { completed: true });
    return true;
  }
  return false;
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
  if (state.conversationId) {
    const conversationRoot = `/api/conversations/${encodeURIComponent(state.conversationId)}`;
    if (url.pathname === `${conversationRoot}/state`) {
      state.counters.state += 1;
      const messages: unknown[] = [
        { id: "user-multitab", role: "user", parts: [{ type: "text", text: state.prompt }] },
      ];
      if (state.completed) {
        messages.push({
          id: ASSISTANT_MESSAGE_ID,
          role: "assistant",
          parts: [{ type: "text", text: COMPLETE_ANSWER }],
        });
      }
      json(response, 200, {
        messages,
        activeTurn: state.running ? { turnId: TURN_ID, runId: RUN_ID, status: "running" } : null,
      });
      return true;
    }
  }
  if (url.pathname === `/api/conversations/${REFERENCE_CONVERSATION_ID}/state`) {
    state.counters.state += 1;
    json(response, 200, {
      activeTurn: null,
      messages: [
        { id: "user-reference", role: "user", parts: [{ type: "text", text: REFERENCE_PROMPT }] },
        {
          id: "assistant-reference",
          role: "assistant",
          parts: [{ type: "text", text: REFERENCE_ANSWER }],
        },
      ],
    });
    return true;
  }
  if (url.pathname === `/api/conversations/${CONFLICT_CONVERSATION_ID}/state`) {
    state.counters.state += 1;
    json(response, 200, {
      activeTurn: null,
      messages: [
        { id: "user-conflict", role: "user", parts: [{ type: "text", text: CONFLICT_PROMPT }] },
        {
          id: "assistant-conflict",
          role: "assistant",
          parts: [{ type: "text", text: CONFLICT_ANSWER }],
        },
      ],
    });
    return true;
  }
  return false;
}

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
  state.running = true;
  // The conflict fixture deliberately withholds the cross-tab running event so
  // the losing tab can prove its bounded 409 presentation before reconciliation.
  if (state.conversationId !== CONFLICT_CONVERSATION_ID) {
    publishActivity("running");
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

function openStream(response: ServerResponse, includeRunHeader: boolean): void {
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": "text/event-stream",
    ...(includeRunHeader ? { "x-workflow-run-id": RUN_ID } : {}),
    "x-vercel-ai-ui-message-stream": "v1",
  });
  for (const chunk of partialChunks) writeChunk(response, chunk);
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
  state.running = false;
  publishActivity("completed");
  for (const response of state.subscribers) {
    for (const chunk of terminalChunks) writeChunk(response, chunk);
    response.end("data: [DONE]\n\n");
  }
  state.subscribers.clear();
}

function closeSubscribers(): void {
  for (const response of state.subscribers) response.end("data: [DONE]\n\n");
  state.subscribers.clear();
}

function closeActivitySubscribers(): void {
  for (const response of state.activitySubscribers) response.end();
  state.activitySubscribers.clear();
}

function publishActivity(status: TurnActivityEvent["status"]): void {
  for (const response of state.activitySubscribers) publishActivityTo(response, status);
}

function publishActivityTo(response: ServerResponse, status: TurnActivityEvent["status"]): void {
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
    completed: state.completed,
    conversationId: state.conversationId,
    counters: state.counters,
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
