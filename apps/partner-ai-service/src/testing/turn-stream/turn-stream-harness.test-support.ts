import {
  decodeSseEvents,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { expect } from "vitest";

import type { PartnerAiServiceApp } from "#inbound/http/app";

const DEFAULT_AUTH_TOKEN = "Bearer local-test-token";

/**
 * Fast safety-poll cadence for memory-backed tests.
 *
 * Memory persistence has no Postgres `NOTIFY`, so the subscription stream delivers
 * live events only on its safety poll. A short interval keeps unit tests prompt
 * while still exercising the real poll-driven path.
 */
export const TEST_SAFETY_POLL_INTERVAL_MS = 10;

/**
 * Start one turn through `POST /chat/runs` and return its identity while
 * generation is still in flight.
 *
 * The POST response is the turn's SSE stream; identity travels as the
 * `sidechat.started` frame at sequence 0 (`assistantTurnId` on the envelope,
 * `conversationId` on the event). This helper reads exactly that first frame and
 * then cancels the body — which doubles as a standing regression check that
 * dropping the starting connection releases only the subscriber and never
 * interrupts server-owned generation.
 */
export const startRun = async (
  app: PartnerAiServiceApp,
  request: ChatStreamRequest,
  authToken: string = DEFAULT_AUTH_TOKEN,
): Promise<{ readonly assistantTurnId: string; readonly conversationId: string }> => {
  const response = await postRun(app, request, authToken);
  const started = await readFirstFrame(response);
  return startedIdentity(started);
};

/**
 * Subscribe to one turn's stream and decode the full SSE body.
 *
 * This is the same-instance resume route: `takeUntil(isTerminal)` ends the stream
 * at the terminal event, so reading the body to completion yields the whole turn.
 * `after = -1` replays from `sidechat.started`.
 */
export const readTurnStream = async (
  app: PartnerAiServiceApp,
  assistantTurnId: string,
  after = -1,
  authToken: string = DEFAULT_AUTH_TOKEN,
): Promise<readonly SidechatStreamEvent[]> => {
  const response = await app.request(`/chat/turns/${assistantTurnId}/stream?after=${after}`, {
    headers: { authorization: authToken },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  return decodeSseEvents(await response.text());
};

/**
 * Run one turn end to end over the single connection-bound call.
 *
 * `POST /chat/runs` starts generation and streams the turn on the same response
 * (ADR 0007); draining the body to completion yields `sidechat.started` through
 * the terminal event — exactly what a browser subscriber sees.
 */
export const runTurnStream = async (
  app: PartnerAiServiceApp,
  request: ChatStreamRequest,
  authToken: string = DEFAULT_AUTH_TOKEN,
): Promise<{
  readonly assistantTurnId: string;
  readonly conversationId: string;
  readonly events: readonly SidechatStreamEvent[];
}> => {
  const response = await postRun(app, request, authToken);
  const events = decodeSseEvents(await response.text());
  expect(events.length).toBeGreaterThan(0);
  return { ...startedIdentity(events[0] as SidechatStreamEvent), events };
};

/** Read the `conversationId` carried on the replayed `sidechat.started` event. */
export const startedConversationId = (events: readonly SidechatStreamEvent[]): string => {
  const started = events.find((event) => event.type === "sidechat.started");
  if (!started || !("conversationId" in started) || !started.conversationId) {
    throw new Error("Expected the stream to include a started event with conversationId.");
  }
  return started.conversationId;
};

const postRun = async (
  app: PartnerAiServiceApp,
  request: ChatStreamRequest,
  authToken: string,
): Promise<Response> => {
  const response = await app.request("/chat/runs", {
    method: "POST",
    headers: { authorization: authToken, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  return response;
};

/**
 * Read SSE frames until the first complete one, decode it, and cancel the body.
 *
 * Cancelling releases this subscriber's registration; the generation fiber lives
 * in the runner's scope and keeps running to its durable terminal.
 */
const readFirstFrame = async (response: Response): Promise<SidechatStreamEvent> => {
  const body = response.body;
  if (!body) throw new Error("Expected the run response to carry an SSE body.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (!buffered.includes("\n\n")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffered += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel();

  const frame = buffered.split("\n\n")[0];
  const events = decodeSseEvents(`${frame ?? ""}\n\n`);
  const started = events[0];
  if (!started) throw new Error("Expected the first SSE frame of a run response.");
  return started;
};

const startedIdentity = (
  started: SidechatStreamEvent,
): { readonly assistantTurnId: string; readonly conversationId: string } => {
  expect(started.type).toBe("sidechat.started");
  if (started.type !== "sidechat.started" || !started.conversationId) {
    throw new Error("Expected sidechat.started with a conversationId as the first frame.");
  }
  return {
    assistantTurnId: started.assistantTurnId,
    conversationId: started.conversationId,
  };
};
