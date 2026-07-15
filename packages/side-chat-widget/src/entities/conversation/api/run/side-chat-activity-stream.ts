import { omitUndefinedProperties } from "@side-chat/shared";
import { decodeTurnActivitySseEvents } from "@side-chat/chat-protocol";
import { decodeSseEventStream } from "#shared/lib/sse/sse-event-stream";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl } from "../http/side-chat-http-helpers.js";
import type {
  FetchLike,
  SideChatApiClientOptions,
  SubscribeActivityOptions,
  SubscribeActivityResult,
} from "../client/side-chat-api-types.js";

const DEFAULT_ACTIVITY_PATH = "/chat/activity";

/**
 * Subscribe to the subject-scoped activity stream as Server-Sent Events.
 *
 * Yields a snapshot of currently-running turns, then live lifecycle transitions.
 * Unlike the per-turn stream it has no terminal and no sequence rules — it yields
 * until the caller aborts. A malformed frame is skipped so one bad signal never
 * ends the stream.
 */
export const subscribeActivityWithFetch = async (
  clientOptions: SideChatApiClientOptions,
  options: SubscribeActivityOptions,
  transport: FetchLike,
): Promise<SubscribeActivityResult> => {
  assertNotAborted(options.signal);
  const response = await transport(activityUrl(clientOptions), activityInit(options.signal));
  if (!response.ok) {
    throw new SideChatApiError("http_error", `Activity stream request failed: ${response.status}`, {
      status: response.status,
    });
  }
  if (!response.body) {
    throw new SideChatApiError("network_error", "Activity stream response body is missing");
  }
  return {
    events: decodeSseEventStream(
      response.body,
      () => assertNotAborted(options.signal),
      decodeTurnActivitySseEvents,
    ),
  };
};

const activityUrl = (options: SideChatApiClientOptions): string =>
  buildPathUrl(options.baseUrl, options.activityPath ?? DEFAULT_ACTIVITY_PATH);

const activityInit = (signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({ headers: { accept: "text/event-stream" }, signal });
