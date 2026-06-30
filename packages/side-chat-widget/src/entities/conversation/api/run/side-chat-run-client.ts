import { parseChatStreamRequest, type ChatStreamRequest } from "@side-chat/chat-protocol";
import { isRecord, omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl, createHttpError } from "../http/side-chat-http-helpers.js";
import { retryJsonRequest } from "./side-chat-run-retry.js";
import type {
  CancelTurnResult,
  CreateRunOptions,
  CreateRunResult,
  FetchLike,
  ResolveRunResult,
  SideChatApiClientOptions,
  SubmitHostCommandResultInput,
  SubmitHostCommandResultResult,
  TurnStatusResult,
} from "../client/side-chat-api-types.js";

const DEFAULT_RUNS_PATH = "/chat/runs";
const DEFAULT_TURNS_PATH = "/chat/turns";

/**
 * Identity half of the resumable chat flow.
 *
 * `POST /chat/runs` runs pre-start synchronously and returns the turn identity as
 * JSON; the browser then subscribes to the turn stream separately. A turn-creating
 * POST is retried on the configured statuses, deduped server-side by the request
 * idempotency key, so a replayed create never forks a second generation.
 */
export const createRunWithFetch = async (
  request: ChatStreamRequest,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<CreateRunResult> => {
  const parsedRequest = parseChatStreamRequest(request);
  const response = await retryJsonRequest(
    {
      run: () => requestCreateRun(parsedRequest, clientOptions, options, transport),
      retry: options.retry ?? clientOptions.retry,
      signal: options.signal,
    },
    "create run",
  );
  return normalizeCreateRun(await readJson(response, "create run"));
};

/** Resolve a lost create reply: map the client request id back to its turn. */
export const resolveRunWithFetch = async (
  requestId: string,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<ResolveRunResult> => {
  assertNotAborted(options.signal);
  const response = await transport(runUrl(clientOptions, requestId), requestInit(options.signal));
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeResolveRun(await readJson(response, "resolve run"));
};

/** Read one turn's current status by id. */
export const getTurnStatusWithFetch = async (
  assistantTurnId: string,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<TurnStatusResult> => {
  assertNotAborted(options.signal);
  const response = await transport(
    turnUrl(clientOptions, assistantTurnId),
    requestInit(options.signal),
  );
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeTurnStatus(await readJson(response, "turn status"));
};

/** Request cancellation of one turn; the server CAS-acks even an unknown turn. */
export const cancelTurnWithFetch = async (
  assistantTurnId: string,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<CancelTurnResult> => {
  assertNotAborted(options.signal);
  const response = await transport(turnCancelUrl(clientOptions, assistantTurnId), {
    method: "POST",
    ...requestInit(options.signal),
  });
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeCancelTurn(await readJson(response, "cancel turn"));
};

/** Post a dispatched UI (host) tool result so the awaiting server tool call resolves. */
export const submitHostCommandResultWithFetch = async (
  input: SubmitHostCommandResultInput,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<SubmitHostCommandResultResult> => {
  assertNotAborted(options.signal);
  const response = await transport(
    hostCommandResultUrl(clientOptions, input.assistantTurnId, input.commandId),
    omitUndefinedProperties({
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(input.result),
      signal: options.signal,
    }),
  );
  if (!response.ok) throw createHttpError(response.status, 1);
  return normalizeSubmitHostCommandResult(await readJson(response, "host command result"));
};

const requestCreateRun = (
  request: ChatStreamRequest,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<Response> => transport(runsUrl(clientOptions), createRunInit(request, options.signal));

const createRunInit = (request: ChatStreamRequest, signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      // Lets the server dedupe a replayed create so retries never create duplicates.
      "idempotency-key": request.requestId,
    },
    body: JSON.stringify(request),
    signal,
  });

const requestInit = (signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({ headers: { accept: "application/json" }, signal });

const runsUrl = (options: SideChatApiClientOptions): string =>
  buildPathUrl(options.baseUrl, options.runsPath ?? DEFAULT_RUNS_PATH);

const runUrl = (options: SideChatApiClientOptions, requestId: string): URL =>
  new URL(encodeURIComponent(requestId), `${runsUrl(options)}/`);

const turnsBaseUrl = (options: SideChatApiClientOptions): string =>
  buildPathUrl(options.baseUrl, options.turnsPath ?? DEFAULT_TURNS_PATH);

const turnUrl = (options: SideChatApiClientOptions, assistantTurnId: string): URL =>
  new URL(encodeURIComponent(assistantTurnId), `${turnsBaseUrl(options)}/`);

const turnCancelUrl = (options: SideChatApiClientOptions, assistantTurnId: string): URL =>
  new URL(`${encodeURIComponent(assistantTurnId)}/cancel`, `${turnsBaseUrl(options)}/`);

const hostCommandResultUrl = (
  options: SideChatApiClientOptions,
  assistantTurnId: string,
  commandId: string,
): URL =>
  new URL(
    `${encodeURIComponent(assistantTurnId)}/host-commands/${encodeURIComponent(commandId)}/result`,
    `${turnsBaseUrl(options)}/`,
  );

const readJson = async (response: Response, route: string): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new SideChatApiError("network_error", `Malformed ${route} response JSON`, { cause });
  }
};

export const normalizeCreateRun = (payload: unknown): CreateRunResult => {
  if (
    !isRecord(payload) ||
    typeof payload["requestId"] !== "string" ||
    typeof payload["assistantTurnId"] !== "string" ||
    typeof payload["conversationId"] !== "string" ||
    typeof payload["status"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed create run response");
  }
  return {
    requestId: payload["requestId"],
    assistantTurnId: payload["assistantTurnId"],
    conversationId: payload["conversationId"],
    status: payload["status"],
  };
};

const normalizeResolveRun = (payload: unknown): ResolveRunResult => {
  if (
    !isRecord(payload) ||
    typeof payload["assistantTurnId"] !== "string" ||
    typeof payload["status"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed resolve run response");
  }
  return { assistantTurnId: payload["assistantTurnId"], status: payload["status"] };
};

const normalizeTurnStatus = (payload: unknown): TurnStatusResult => {
  if (
    !isRecord(payload) ||
    typeof payload["assistantTurnId"] !== "string" ||
    typeof payload["conversationId"] !== "string" ||
    typeof payload["requestId"] !== "string" ||
    typeof payload["status"] !== "string"
  ) {
    throw new SideChatApiError("network_error", "Malformed turn status response");
  }
  return {
    assistantTurnId: payload["assistantTurnId"],
    conversationId: payload["conversationId"],
    requestId: payload["requestId"],
    status: payload["status"],
  };
};

const normalizeCancelTurn = (payload: unknown): CancelTurnResult => {
  if (
    !isRecord(payload) ||
    typeof payload["assistantTurnId"] !== "string" ||
    typeof payload["cancelRequested"] !== "boolean"
  ) {
    throw new SideChatApiError("network_error", "Malformed cancel turn response");
  }
  return {
    assistantTurnId: payload["assistantTurnId"],
    cancelRequested: payload["cancelRequested"],
  };
};

const normalizeSubmitHostCommandResult = (payload: unknown): SubmitHostCommandResultResult => {
  if (!isRecord(payload) || typeof payload["settled"] !== "boolean") {
    throw new SideChatApiError("network_error", "Malformed host command result response");
  }
  return { settled: payload["settled"] };
};
