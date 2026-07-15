import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import {
  TURN_REPLAY_RESULTS,
  type TurnReplay,
  type TurnReplayResult,
} from "#application/ports/turn/replay/turn-replay";
import { TURN_MESSAGE_ROLES, type TurnMessage } from "#domain/turn/turn";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";

const TEST_CONVERSATION = {
  conversationId: "conversation-1",
  workspaceId: "local-workspace",
  subjectId: "local-workspace:subject",
} as const;
const SUCCESS_HTTP_STATUS = 200;
const TEST_RUN_ID = "run-1";
const UNKNOWN_RUN_ID = "run-secret";
const acceptedUserMessage: TurnMessage = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
};

describe("chat replay route", () => {
  it.each([
    [undefined, 0],
    ["0", 0],
    ["-3", -3],
    ["4", 4],
  ] as const)(
    "opens replay at startIndex %s and returns the durable tail",
    async (source, expected) => {
      const state = ownedState();
      await bindOwnedRun(state, TEST_RUN_ID);
      const replay = new ControlledTurnReplay({
        status: TURN_REPLAY_RESULTS.FOUND,
        tailIndex: 4,
        stream: chunks({ type: "start" }, { type: "finish" }),
      });
      const harness = await createServiceTestHarness({ turnState: state, turnReplay: replay });
      try {
        const query = source === undefined ? "" : `?startIndex=${source}`;
        const response = await harness.request(`${streamRoute(TEST_RUN_ID)}${query}`);
        expect(response.status).toBe(SUCCESS_HTTP_STATUS);
        expect(response.headers.get(HTTP_HEADERS.WORKFLOW_STREAM_TAIL_INDEX)).toBe("4");
        expect(replay.opened).toEqual([
          {
            runId: TEST_RUN_ID,
            startIndex: expected,
            assistantMessageId: "turn-1-assistant",
          },
        ]);
        expect((await responseChunks(response)).map((part) => part["type"])).toEqual([
          "start",
          "finish",
        ]);
      } finally {
        await harness.close();
      }
    },
  );

  it.each(["1.5", "+1", "01", "1e2", "safe?", "9007199254740992"])(
    "rejects malformed replay startIndex %s before opening Workflow",
    async (startIndex) => {
      const replay = new ControlledTurnReplay({ status: TURN_REPLAY_RESULTS.NOT_FOUND });
      const harness = await createServiceTestHarness({ turnReplay: replay });
      try {
        const response = await harness.request(
          `${streamRoute(TEST_RUN_ID)}?startIndex=${startIndex}`,
        );
        expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
        expect(replay.opened).toEqual([]);
      } finally {
        await harness.close();
      }
    },
  );

  it("hides unknown ownership and a pruned Workflow run behind the same 404", async () => {
    const state = ownedState();
    const replay = new ControlledTurnReplay({ status: TURN_REPLAY_RESULTS.NOT_FOUND });
    const harness = await createServiceTestHarness({ turnState: state, turnReplay: replay });
    try {
      expect((await harness.request(streamRoute(UNKNOWN_RUN_ID))).status).toBe(
        HTTP_ERROR.NOT_FOUND.STATUS,
      );
      expect(replay.opened).toEqual([]);
      await bindOwnedRun(state, TEST_RUN_ID);
      expect((await harness.request(streamRoute(TEST_RUN_ID))).status).toBe(
        HTTP_ERROR.NOT_FOUND.STATUS,
      );
      expect(replay.opened).toEqual([
        {
          runId: TEST_RUN_ID,
          startIndex: 0,
          assistantMessageId: "turn-1-assistant",
        },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("rejects a cursor beyond the durable end without opening an SSE body", async () => {
    const state = ownedState();
    await bindOwnedRun(state, TEST_RUN_ID);
    const replay = new ControlledTurnReplay({
      status: TURN_REPLAY_RESULTS.START_INDEX_OUT_OF_RANGE,
      tailIndex: 2,
    });
    const harness = await createServiceTestHarness({ turnState: state, turnReplay: replay });
    try {
      const response = await harness.request(`${streamRoute(TEST_RUN_ID)}?startIndex=4`);
      expect(response.status).toBe(HTTP_ERROR.RANGE_NOT_SATISFIABLE.STATUS);
      expect(response.headers.get(HTTP_HEADERS.WORKFLOW_STREAM_TAIL_INDEX)).toBe("2");
      expect(response.headers.get("content-type")).toContain("application/json");
    } finally {
      await harness.close();
    }
  });

  it("releases the replay source when the client disconnects", async () => {
    const state = ownedState();
    await bindOwnedRun(state, TEST_RUN_ID);
    const cancelled = vi.fn<(reason?: unknown) => void>();
    const replay = new ControlledTurnReplay({
      status: TURN_REPLAY_RESULTS.FOUND,
      tailIndex: 0,
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start" });
        },
        cancel: cancelled,
      }),
    });
    const harness = await createServiceTestHarness({ turnState: state, turnReplay: replay });
    try {
      const response = await harness.request(streamRoute(TEST_RUN_ID));
      const reader = response.body?.getReader();
      await reader?.read();
      await reader?.cancel("client disconnected");
      expect(cancelled).toHaveBeenCalledOnce();
    } finally {
      await harness.close();
    }
  });
});

class ControlledTurnReplay implements TurnReplay {
  readonly opened: Array<{
    runId: string;
    startIndex: number;
    assistantMessageId: string;
  }> = [];
  constructor(private readonly result: TurnReplayResult) {}
  open(runId: string, startIndex: number, assistantMessageId: string): Promise<TurnReplayResult> {
    this.opened.push({ runId, startIndex, assistantMessageId });
    return Promise.resolve(this.result);
  }
}

function ownedState(): InMemoryTurnState {
  return new InMemoryTurnState([TEST_CONVERSATION]);
}
function streamRoute(runId: string): string {
  return CHAT_HTTP_ROUTES.STREAM.replace(":runId", runId);
}
function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
async function responseChunks(response: Response): Promise<Array<Record<string, unknown>>> {
  return (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => parseChunk(line.slice(6)));
}
function parseChunk(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) {
    throw new Error(`Expected an object stream part: ${source}`);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
async function bindOwnedRun(state: InMemoryTurnState, runId: string): Promise<void> {
  const turn = await state.beginTurn({
    auth: {
      workspaceId: TEST_CONVERSATION.workspaceId,
      subjectId: TEST_CONVERSATION.subjectId,
      issuedAt: "2026-01-01T00:00:00.000Z",
    },
    conversationId: TEST_CONVERSATION.conversationId,
    requestId: "replay-request",
    userMessage: acceptedUserMessage,
  });
  await state.bindRun(turn, runId);
}
