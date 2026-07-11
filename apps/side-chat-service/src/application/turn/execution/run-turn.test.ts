import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_MESSAGE_ROLES,
  TURN_TERMINAL_STATUSES,
} from "#domain/turn/turn";

import { runTurn, type RunTurnDependencies } from "./run-turn.js";

const AUTH = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "now",
} as const;

const USER_MESSAGE = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
} as const;

const ASSISTANT_MESSAGE = {
  id: "assistant-1",
  role: TURN_MESSAGE_ROLES.ASSISTANT,
  text: "Done",
} as const;

describe("runTurn", () => {
  it("keeps the response stream open until terminal persistence succeeds", async () => {
    const terminal = deferred<TurnExecutionTerminal>();
    const harness = createHarness(terminal.promise);
    const running = await runTurn(harness.dependencies, turnInput());
    const reader = running.stream.getReader();
    const endOfStream = reader.read();

    await expect(promiseState(endOfStream)).resolves.toBe("pending");

    terminal.resolve({
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      stepUsage: [],
      assistantMessage: ASSISTANT_MESSAGE,
    });

    await expect(endOfStream).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(harness.state.assistantMessages).toEqual([ASSISTANT_MESSAGE]);
    expect(harness.admission.released).toBe(1);
  });

  it("errors the response stream when terminal persistence fails", async () => {
    const persistenceFailure = new Error("assistant persistence failed");
    const harness = createHarness(
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [],
        assistantMessage: ASSISTANT_MESSAGE,
      }),
      {
        appendAssistantMessage: () => Promise.reject(persistenceFailure),
      },
    );
    const running = await runTurn(harness.dependencies, turnInput());

    await expect(running.stream.getReader().read()).rejects.toBe(persistenceFailure);
    expect(harness.admission.released).toBe(1);
  });

  it("maps a rejected terminal promise to a failed terminal and releases admission", async () => {
    const harness = createHarness(Promise.reject(new Error("workflow return failed")));
    const running = await runTurn(harness.dependencies, turnInput());

    await expect(running.stream.getReader().read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(harness.state.terminals.get("turn-1")).toMatchObject({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.WORKFLOW_FAILED,
    });
    expect(harness.admission.released).toBe(1);
  });
});

function createHarness(
  terminal: Promise<TurnExecutionTerminal>,
  messages?: RunTurnDependencies["messages"],
) {
  const state = new InMemoryTurnState([
    {
      conversationId: "conversation-1",
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
    },
  ]);
  const admission = new DeterministicTurnAdmission();
  const execution = new FixedTurnExecution(terminal);
  const dependencies: RunTurnDependencies = {
    admission,
    turns: state,
    execution,
    messages: messages ?? state,
  };
  return { state, admission, dependencies };
}

class FixedTurnExecution implements TurnExecution {
  constructor(private readonly terminal: Promise<TurnExecutionTerminal>) {}

  start(_input: TurnExecutionInput): Promise<StartedTurnExecution> {
    return Promise.resolve({
      runId: "run-1",
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      }),
      terminal: this.terminal,
    });
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }
}

function turnInput() {
  return {
    auth: AUTH,
    conversationId: "conversation-1",
    requestId: "request-1",
    modelId: "test-model",
    messages: [USER_MESSAGE],
    acceptedUserMessage: USER_MESSAGE,
  } as const;
}

function deferred<T>() {
  return Promise.withResolvers<T>();
}

async function promiseState(promise: Promise<unknown>): Promise<"pending" | "settled"> {
  return Promise.race([
    promise.then(() => "settled" as const),
    Promise.resolve("pending" as const),
  ]);
}
