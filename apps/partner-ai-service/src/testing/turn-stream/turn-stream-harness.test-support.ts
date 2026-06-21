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

/** Start one turn through the runs route and return its parsed JSON identity. */
export const startRun = async (
  app: PartnerAiServiceApp,
  request: ChatStreamRequest,
  authToken: string = DEFAULT_AUTH_TOKEN,
): Promise<{ readonly assistantTurnId: string; readonly conversationId: string }> => {
  const response = await app.request("/chat/runs", {
    method: "POST",
    headers: { authorization: authToken, "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  return {
    assistantTurnId: body["assistantTurnId"] as string,
    conversationId: body["conversationId"] as string,
  };
};

/**
 * Subscribe to one turn's stream and decode the full SSE body.
 *
 * `takeUntil(isTerminal)` ends the stream at the terminal event, so reading the
 * body to completion yields the whole turn. `after = -1` replays from
 * `sidechat.started`.
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
 * Run one turn end to end: start it, then replay + tail its stream to the terminal.
 *
 * This is the new single streaming path (`POST /chat/runs` then
 * `GET /chat/turns/:id/stream`) that replaced the response-owned `POST
 * /chat/stream`. The returned events are exactly what a browser subscriber sees.
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
  const started = await startRun(app, request, authToken);
  const events = await readTurnStream(app, started.assistantTurnId, -1, authToken);
  return { ...started, events };
};

/** Read the `conversationId` carried on the replayed `sidechat.started` event. */
export const startedConversationId = (events: readonly SidechatStreamEvent[]): string => {
  const started = events.find((event) => event.type === "sidechat.started");
  if (!started || !("conversationId" in started) || !started.conversationId) {
    throw new Error("Expected the stream to include a started event with conversationId.");
  }
  return started.conversationId;
};
