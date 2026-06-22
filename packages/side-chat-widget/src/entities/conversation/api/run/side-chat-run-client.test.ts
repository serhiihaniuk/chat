import { SIDECHAT_PROTOCOL_VERSION, type ChatStreamRequest } from "@side-chat/chat-protocol";
import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../client/side-chat-api-types.js";
import {
  cancelTurnWithFetch,
  createRunWithFetch,
  getTurnStatusWithFetch,
  resolveRunWithFetch,
} from "./side-chat-run-client.js";

const clientOptions = { baseUrl: "https://example.test" } as const;

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: { id: "message-1", content: "hello" },
};

describe("side chat run client", () => {
  it("encodes ids into resolve, status, and cancel paths", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn 1", status: "running" }))
      .mockResolvedValueOnce(
        Response.json({
          assistantTurnId: "turn 1",
          conversationId: "c1",
          requestId: "request-1",
          status: "completed",
        }),
      )
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn 1", cancelRequested: false }));

    await resolveRunWithFetch("req 1", clientOptions, {}, fetchMock);
    await getTurnStatusWithFetch("turn 1", clientOptions, {}, fetchMock);
    await cancelTurnWithFetch("turn 1", clientOptions, {}, fetchMock);

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://example.test/chat/runs/req%201",
      "https://example.test/chat/turns/turn%201",
      "https://example.test/chat/turns/turn%201/cancel",
    ]);
  });

  it("surfaces a non-retryable network failure from create", async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.reject(new TypeError("offline")));

    await expect(createRunWithFetch(request, clientOptions, {}, fetchMock)).rejects.toMatchObject({
      code: "network_error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exhausts the retry budget and reports the last status error", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response("busy", { status: 503 })),
    );

    await expect(
      createRunWithFetch(request, { ...clientOptions, retry: { attempts: 2 } }, {}, fetchMock),
    ).rejects.toMatchObject({ code: "http_error", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
