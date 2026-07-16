import { safeValidateUIMessages, type UIMessage } from "ai";
import { isRecord } from "@side-chat/shared";
import {
  isSideChatErrorCode,
  type SideChatReasoningEffort,
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

/** Browser configuration shared by every conversation in one workflow widget. */
export type WorkflowChatClient = Readonly<{
  /** Service origin or proxy base without an endpoint-specific path. */
  baseUrl: string;
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
  /** Optional provider-neutral reasoning effort included with the next send. */
  reasoningEffort?: SideChatReasoningEffort | undefined;
  /** Optional server-tool narrowing included with the next send. */
  enabledToolNames?: readonly string[] | undefined;
}>;

/** Request client after the widget has chosen one draft or persisted conversation. */
export type WorkflowConversationClient = WorkflowChatClient &
  Readonly<{
    conversationId: string;
  }>;

export const WORKFLOW_CHAT_TRANSPORT_ERROR_CODE = "transport_error";
const WORKFLOW_CHAT_HTTP_ERROR_CODE = "http_error";

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

export type WorkflowActiveTurn = Readonly<{ turnId: string; runId: string }>;

export type WorkflowConversationState = Readonly<{
  messages: readonly WorkflowUIMessage[];
  activeTurn?: WorkflowActiveTurn | undefined;
}>;

/** Read transcript and resumable run identity from one coherent server snapshot. */
export async function readWorkflowConversationState(
  client: WorkflowConversationClient,
  signal?: AbortSignal,
): Promise<WorkflowConversationState> {
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(
      client,
      `/api/conversations/${encodeURIComponent(client.conversationId)}/state`,
    ),
    createHistoryRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload["messages"])) {
    throw new Error("Conversation history response is invalid.");
  }
  const messages = await validateWorkflowHistory(payload["messages"]);
  const activeTurn = parseWorkflowActiveTurn(payload["activeTurn"]);
  return { messages, ...(activeTurn === undefined ? {} : { activeTurn }) };
}

async function validateWorkflowHistory(
  value: readonly unknown[],
): Promise<readonly WorkflowUIMessage[]> {
  if (value.length === 0) return [];
  const validated = await safeValidateUIMessages<WorkflowUIMessage>({
    messages: value,
    metadataSchema: sideChatMessageMetadataSchema,
  });
  if (!validated.success) throw new Error("Conversation history contains invalid messages.");
  return validated.data;
}

function parseWorkflowActiveTurn(value: unknown): WorkflowActiveTurn | undefined {
  if (!isRecord(value)) return undefined;
  const runId = value["runId"];
  const turnId = value["turnId"];
  return typeof runId === "string" && typeof turnId === "string" ? { runId, turnId } : undefined;
}

export async function cancelWorkflowChatRun(
  client: WorkflowConversationClient,
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

/** Open the authenticated subject activity response; widget orchestration owns decoding. */
export async function openWorkflowActivityStream(
  client: WorkflowChatClient,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  assertWorkflowRequestActive(signal);
  const request = await resolveWorkflowChatRequestConfig(client);
  const response = await workflowChatFetch(client)(
    workflowChatUrl(client, "/api/activity"),
    createActivityRequestInit(request, signal),
  );
  if (!response.ok) throw await readWorkflowChatHttpError(response);
  if (!response.body) {
    throw new WorkflowChatHttpError(
      WORKFLOW_CHAT_TRANSPORT_ERROR_CODE,
      "Activity stream response body is missing.",
      true,
    );
  }
  return response.body;
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
  return payload ?? new WorkflowChatHttpError(WORKFLOW_CHAT_TRANSPORT_ERROR_CODE, message, false);
}

export async function readWorkflowChatHttpError(
  response: Response,
): Promise<WorkflowChatHttpError> {
  const text = await response.text();
  const payload = parseErrorPayload(text, response.status);
  return (
    payload ??
    new WorkflowChatHttpError(
      WORKFLOW_CHAT_HTTP_ERROR_CODE,
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
    return new WorkflowChatHttpError(
      WORKFLOW_CHAT_HTTP_ERROR_CODE,
      status === undefined ? "Chat request failed." : `Chat request failed with status ${status}.`,
      false,
      status,
    );
  } catch {
    return undefined;
  }
}

function isWorkflowChatHttpError(value: unknown): value is WorkflowChatHttpError {
  return value instanceof WorkflowChatHttpError;
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

function createActivityRequestInit(
  request: WorkflowChatRequestConfig,
  signal: AbortSignal | undefined,
): RequestInit {
  const init = createHistoryRequestInit(request, signal);
  const headers = new Headers(init.headers);
  headers.set("accept", "text/event-stream");
  init.headers = headers;
  return init;
}

function assertWorkflowRequestActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return;
  throw new WorkflowChatHttpError(
    WORKFLOW_CHAT_TRANSPORT_ERROR_CODE,
    "Activity stream was aborted.",
    true,
  );
}
