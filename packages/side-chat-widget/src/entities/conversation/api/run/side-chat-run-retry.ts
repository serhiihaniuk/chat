import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, createHttpError } from "../http/side-chat-http-helpers.js";
import type { RetryPolicy } from "../client/side-chat-api-types.js";

// 409 is intentionally excluded: a Conflict is not safely retryable for a
// turn-creating POST. The create carries an idempotency-key so the server can
// dedupe when a retryable status (timeout / overload) is replayed.
const DEFAULT_RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 5_000;

export type RetryJsonRequestInput = {
  /** Perform one attempt; resolves to the raw HTTP response. */
  readonly run: (attempt: number) => Promise<Response>;
  readonly retry: RetryPolicy | undefined;
  readonly signal: AbortSignal | undefined;
};

/**
 * Run a JSON request with bounded retries, returning the accepted `Response`.
 *
 * Retries only happen for configured HTTP statuses (timeout/overload), never for
 * a 409 conflict. The caller parses the body; this helper owns attempt counting,
 * abort checks, and jittered backoff so each request method stays declarative.
 */
export const retryJsonRequest = async (
  input: RetryJsonRequestInput,
  route: string,
): Promise<Response> => {
  const maxAttempts = Math.max(1, input.retry?.attempts ?? 1);
  let attempt = 1;

  while (attempt <= maxAttempts) {
    const result = await runJsonAttempt(input, attempt, route);
    if (result.ok) return result.response;
    if (!shouldRetry(result.error, input.retry, attempt, maxAttempts)) throw result.error;
    await delayBeforeRetry(attempt, input.signal);
    attempt += 1;
  }

  throw new SideChatApiError("network_error", `Retry loop exhausted for ${route}`, {
    attempt: maxAttempts,
  });
};

type JsonAttemptResult =
  | { readonly ok: true; readonly response: Response }
  | { readonly ok: false; readonly error: SideChatApiError };

const runJsonAttempt = async (
  input: RetryJsonRequestInput,
  attempt: number,
  route: string,
): Promise<JsonAttemptResult> => {
  assertNotAborted(input.signal);
  try {
    const response = await input.run(attempt);
    if (!response.ok) return { ok: false, error: createHttpError(response.status, attempt) };
    return { ok: true, response };
  } catch (cause) {
    assertNotAborted(input.signal);
    return { ok: false, error: toClientError(cause, attempt, route) };
  }
};

const toClientError = (cause: unknown, attempt: number, route: string): SideChatApiError => {
  if (cause instanceof SideChatApiError) return cause;
  if (isAbortLikeError(cause)) {
    return new SideChatApiError("aborted", `${route} request was aborted`, { cause, attempt });
  }
  return new SideChatApiError("network_error", `${route} request failed`, { cause, attempt });
};

const isAbortLikeError = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError";

const shouldRetry = (
  error: SideChatApiError,
  retry: RetryPolicy | undefined,
  attempt: number,
  maxAttempts: number,
): boolean => {
  if (attempt >= maxAttempts) return false;
  if (!retry) return false;
  if (error.code !== "http_error" || error.status === undefined) return false;

  const statuses = retry.statuses ? new Set(retry.statuses) : DEFAULT_RETRY_STATUS;
  return statuses.has(error.status);
};

// Exponential backoff with full jitter so a fleet of clients retrying the same
// overloaded server does not resynchronize into a thundering herd.
const delayBeforeRetry = (attempt: number, signal: AbortSignal | undefined): Promise<void> => {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  const waitMs = Math.random() * ceiling;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, waitMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new SideChatApiError("aborted", "Request was aborted", { cause: signal.reason }));
      },
      { once: true },
    );
  });
};
