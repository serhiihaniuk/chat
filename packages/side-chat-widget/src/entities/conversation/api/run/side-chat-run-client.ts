import {
  SIDECHAT_EVENT_TYPES,
  parseChatStreamRequest,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { isRecord, omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl, createHttpError } from "../http/side-chat-http-helpers.js";
import { retryJsonRequest } from "./side-chat-run-retry.js";
import { turnEventStreamFromResponse, turnStreamOpenError } from "./side-chat-turn-stream.js";
import type {
  CancelTurnResult,
  CreateRunOptions,
  FetchLike,
  ResolveRunResult,
  SideChatApiClientOptions,
  StartRunResult,
  SubmitHostCommandResultInput,
  SubmitHostCommandResultResult,
  TurnStatusResult,
} from "../client/side-chat-api-types.js";

const DEFAULT_RUNS_PATH = "/chat/runs";
const DEFAULT_TURNS_PATH = "/chat/turns";

/**
 * Start one assistant turn and open its stream on the same POST (ADR 0007).
 *
 * Pre-start failures arrive as JSON errors and are retried on the configured
 * statuses — the request idempotency key makes a replayed create resolve to the
 * same turn, never a second generation. Once a streaming response is accepted,
 * nothing re-POSTs: the identity is read from the `sidechat.started` frame and
 * the full validated stream (including that frame) is returned for consumption.
 */
export const createRunWithFetch = async (
  request: ChatStreamRequest,
  clientOptions: SideChatApiClientOptions,
  options: CreateRunOptions,
  transport: FetchLike,
): Promise<StartRunResult> => {
  const parsedRequest = parseChatStreamRequest(request);
  let response: Response;
  try {
    response = await retryJsonRequest(
      {
        run: () => requestCreateRun(parsedRequest, clientOptions, options, transport),
        retry: options.retry ?? clientOptions.retry,
        signal: options.signal,
      },
      "create run",
    );
  } catch (error) {
    throw mapCreateRunOpenError(error);
  }
  return startRunResultFromStream(parsedRequest.requestId, response, options.signal);
};

// A wait-your-turn notice for a busy conversation (server 409 `conflict`).
const CONVERSATION_BUSY_MESSAGE =
  "This conversation is already generating a reply. Wait for it to finish before sending another message.";

// Translate a create-run open failure into the code callers branch on. A 404 is
// `replay_expired` (a repeated requestId resolved to a swept finished turn — fall
// back to history); a 409 is `conversation_busy` (another tab/client is mid-turn),
// surfaced as a sane notice rather than a raw HTTP failure.
const mapCreateRunOpenError = (error: unknown): unknown => {
  if (!(error instanceof SideChatApiError) || error.code !== "http_error") return error;
  if (error.status === 404) return turnStreamOpenError(error.status);
  if (error.status === 409) {
    return new SideChatApiError("conversation_busy", CONVERSATION_BUSY_MESSAGE, { status: 409 });
  }
  return error;
};

/**
 * Read the identity frame, then hand back the full stream.
 *
 * The first event of an accepted run response must be `sidechat.started`
 * carrying `conversationId`; it is re-yielded ahead of the remaining events so
 * the consumer's reducer still sees the complete sequence from 0.
 */
const startRunResultFromStream = async (
  requestId: string,
  response: Response,
  signal: AbortSignal | undefined,
): Promise<StartRunResult> => {
  const iterator = turnEventStreamFromResponse(response, signal)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    throw new SideChatApiError("network_error", "Run stream ended before its identity frame");
  }
  const started = first.value;
  if (started.type !== SIDECHAT_EVENT_TYPES.STARTED || !started.conversationId) {
    throw new SideChatApiError(
      "network_error",
      "Run stream did not begin with a sidechat.started identity frame",
    );
  }
  return {
    requestId,
    assistantTurnId: started.assistantTurnId,
    conversationId: started.conversationId,
    events: withReplayedFirstEvent(started, iterator),
  };
};

async function* withReplayedFirstEvent(
  first: SidechatStreamEvent,
  rest: AsyncIterator<SidechatStreamEvent>,
): AsyncGenerator<SidechatStreamEvent> {
  yield first;
  yield* { [Symbol.asyncIterator]: () => rest };
}

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
      accept: "text/event-stream",
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
