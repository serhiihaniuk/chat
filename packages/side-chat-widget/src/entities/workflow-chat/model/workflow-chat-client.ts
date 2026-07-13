import { safeValidateUIMessages, type UIMessage } from "ai";
import {
  isSideChatErrorCode,
  SIDE_CHAT_ERROR_VOCABULARY,
  sideChatMessageMetadataSchema,
  type SideChatDataParts,
  type SideChatMessageMetadata,
} from "@side-chat/stream-profile";

/** Native UI message shape for the workflow branch; metadata is folded turn usage. */
export type WorkflowUIMessage = UIMessage<SideChatMessageMetadata | undefined, SideChatDataParts>;

/**
 * Validate workflow service responses before browser chat state consumes them.
 *
 * History enters as untrusted JSON and leaves as validated `UIMessage[]`.
 * Service failures leave as safe `WorkflowChatHttpError` values; stream decoding
 * and retry behavior remain inside `createWorkflowChatTransport`.
 */
export type WorkflowChatRequestConfig = Readonly<{
  /** Headers resolved immediately before each history, send, replay, or cancel request. */
  headers?: HeadersInit | undefined;
  /** Browser fetch credentials mode resolved with the request headers. */
  credentials?: RequestCredentials | undefined;
}>;

/** Browser configuration for one native workflow conversation. */
export type WorkflowChatClient = Readonly<{
  /** Service origin or proxy base without an endpoint-specific path. */
  baseUrl: string;
  /** Stable conversation id used for history, chat state, replay, and cancellation. */
  conversationId: string;
  /** Optional fetch implementation for browser adapters and deterministic tests. */
  fetch?: typeof fetch | undefined;
  /** Resolve current auth configuration at request time rather than mount time. */
  getRequestConfig?:
    | (() => WorkflowChatRequestConfig | Promise<WorkflowChatRequestConfig>)
    | undefined;
  /** Workflow reconnect error budget. The package default applies when omitted. */
  maxConsecutiveErrors?: number | undefined;
  /** Optional server-recognized model preference included with the next send. */
  modelPreference?: string | undefined;
}>;

/** Safe public HTTP failure returned by the workflow service boundary. */
export class WorkflowChatHttpError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(code: string, message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "WorkflowChatHttpError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export async function readWorkflowChatHistory(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<readonly WorkflowUIMessage[]> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(
      client,
      `/api/conversations/${encodeURIComponent(client.conversationId)}/messages`,
    ),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload["messages"])) {
    throw new Error("Conversation history response is invalid.");
  }
  if (payload["messages"].length === 0) return [];
  const validated = await safeValidateUIMessages<WorkflowUIMessage>({
    messages: payload["messages"],
    metadataSchema: sideChatMessageMetadataSchema,
  });
  if (!validated.success) throw new Error("Conversation history contains invalid messages.");
  return validated.data;
}

/** The conversation's live run, if any, for a cold-load reattach. */
export type WorkflowActiveTurn = Readonly<{ turnId: string; runId: string }>;

/**
 * Discover whether a run is still streaming for this conversation.
 *
 * A cold load seeds history separately; this tells the widget whether to also
 * reattach to an in-progress turn's stream. `undefined` means no live run.
 */
export async function readWorkflowActiveTurn(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<WorkflowActiveTurn | undefined> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(
      client,
      `/api/conversations/${encodeURIComponent(client.conversationId)}/active-turn`,
    ),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error("Active turn response is invalid.");
  const activeTurn = payload["activeTurn"];
  if (!isRecord(activeTurn)) return undefined;
  const runId = activeTurn["runId"];
  const turnId = activeTurn["turnId"];
  if (typeof runId !== "string" || typeof turnId !== "string") return undefined;
  return { runId, turnId };
}

export async function cancelWorkflowChatRun(
  client: WorkflowChatClient,
  runId: string,
): Promise<void> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  const init: RequestInit = {
    method: "POST",
    body: JSON.stringify({ conversationId: client.conversationId }),
    headers,
  };
  if (request.credentials !== undefined) init.credentials = request.credentials;
  const response = await workflowChatFetch(client)(
    workflowChatUrl(client, `/api/chat/${encodeURIComponent(runId)}/cancel`),
    init,
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);
}

export function workflowChatFetch(client: WorkflowChatClient): typeof fetch {
  const request = client.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!request) throw new Error("Fetch is not available.");
  return request;
}

export function workflowChatUrl(client: WorkflowChatClient, path: string): string {
  return `${client.baseUrl.replace(/\/$/u, "")}${path}`;
}

export async function resolveWorkflowChatRequestConfig(
  client: WorkflowChatClient,
): Promise<WorkflowChatRequestConfig> {
  return (await client.getRequestConfig?.()) ?? {};
}

export function normalizeWorkflowChatError(error: unknown): WorkflowChatHttpError {
  if (isWorkflowChatHttpError(error)) return error;
  const message = error instanceof Error ? error.message : "Chat request failed.";
  const payload = parseEmbeddedErrorPayload(message);
  return payload ?? new WorkflowChatHttpError("transport_error", message, false);
}

export async function readWorkflowChatHttpError(
  response: Response,
): Promise<WorkflowChatHttpError> {
  const text = await response.text();
  const payload = parseErrorPayload(text, response.status);
  return (
    payload ??
    new WorkflowChatHttpError(
      "http_error",
      `Chat request failed with status ${response.status}.`,
      false,
      response.status,
    )
  );
}

function parseEmbeddedErrorPayload(message: string): WorkflowChatHttpError | undefined {
  const start = message.indexOf("{");
  return start < 0 ? undefined : parseErrorPayload(message.slice(start));
}

function parseErrorPayload(text: string, status?: number): WorkflowChatHttpError | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return undefined;
    if (typeof value["code"] !== "string" || typeof value["message"] !== "string") {
      return undefined;
    }
    const code = value["code"];
    if (isSideChatErrorCode(code)) {
      const profile = SIDE_CHAT_ERROR_VOCABULARY[code];
      return new WorkflowChatHttpError(code, profile.safeMessage, profile.retryable, status);
    }
    return new WorkflowChatHttpError(code, value["message"], value["retryable"] === true, status);
  } catch {
    return undefined;
  }
}

function isWorkflowChatHttpError(value: unknown): value is WorkflowChatHttpError {
  return value instanceof WorkflowChatHttpError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createHistoryRequestInit(
  request: WorkflowChatRequestConfig,
  signal: AbortSignal | undefined,
): RequestInit {
  const init: RequestInit = {};
  if (request.credentials !== undefined) init.credentials = request.credentials;
  if (request.headers !== undefined) init.headers = request.headers;
  if (signal !== undefined) init.signal = signal;
  return init;
}
