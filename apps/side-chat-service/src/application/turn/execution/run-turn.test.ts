import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { MessageStore } from "#application/ports/turn/message-store";
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

const ASSISTANT_MESSAGE: UIMessage = {
  id: "assistant-1",
  role: TURN_MESSAGE_ROLES.ASSISTANT,
  parts: [{ type: "text", text: "Done" }],
};

const COMPLETED_TERMINAL: TurnExecutionTerminal = {
  status: TURN_TERMINAL_STATUSES.COMPLETED,
  stepUsage: [],
  assistantMessage: ASSISTANT_MESSAGE,
};

describe("runTurn", () => {
  it("keeps the response stream open until the in-memory terminal is projected", async () => {
    const terminal = deferred<TurnExecutionTerminal>();
    const harness = createHarness(terminal.promise);
    const running = await runTurn(harness.dependencies, turnInput());
    const reader = running.stream.getReader();
    const endOfStream = reader.read();

    await expect(promiseState(endOfStream)).resolves.toBe("pending");

    terminal.resolve(COMPLETED_TERMINAL);

    await expect(endOfStream).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(harness.state.assistantMessages).toEqual([ASSISTANT_MESSAGE]);
    expect(harness.admission.released).toBe(1);
  });

  it("leaves terminal persistence to the durable workflow and only releases admission", async () => {
    const harness = createHarness(Promise.resolve(COMPLETED_TERMINAL), {
      durable: true,
    });
    const running = await runTurn(harness.dependencies, turnInput());

    await expect(running.stream.getReader().read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    // The workflow finalize step owns durable persistence; the route touches nothing.
    expect(harness.state.assistantMessages).toEqual([]);
    expect(harness.state.terminals.size).toBe(0);
    expect(harness.admission.released).toBe(1);
  });

  it("errors the response stream when in-memory persistence fails", async () => {
    const persistenceFailure = new Error("assistant persistence failed");
    const harness = createHarness(Promise.resolve(COMPLETED_TERMINAL), {
      messages: { appendAssistantMessage: () => Promise.reject(persistenceFailure) },
    });
    const running = await runTurn(harness.dependencies, turnInput());

    await expect(running.stream.getReader().read()).rejects.toBe(persistenceFailure);
    expect(harness.admission.released).toBe(1);
  });

  it("projects a failed terminal in the in-memory route lane when the run rejects", async () => {
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

  it("starts title enrichment after completion without waiting for the title result", async () => {
    const titleResult = deferred<{ title: string; persisted: boolean }>();
    const startTitle = vi.fn<
      () => Promise<{
        runId: string;
        result: Promise<{ title: string; persisted: boolean }>;
      }>
    >(() => Promise.resolve({ runId: "title-run-1", result: titleResult.promise }));
    const harness = createHarness(Promise.resolve(COMPLETED_TERMINAL));
    const dependencies: RunTurnDependencies = {
      ...harness.dependencies,
      titleGeneration: {
        titles: harness.state,
        workflow: { start: startTitle },
        telemetry: { record: () => undefined },
        modelId: "title-model",
        timeoutMs: 250,
      },
    };

    const running = await runTurn(dependencies, turnInput());
    await expect(running.stream.getReader().read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await vi.waitFor(() => expect(startTitle).toHaveBeenCalledOnce());

    titleResult.resolve({ title: "Deployment risk review", persisted: false });
    await vi.waitFor(() =>
      expect(harness.state.listConversations(AUTH)).resolves.toEqual([
        expect.objectContaining({ title: "Deployment risk review" }),
      ]),
    );
  });
});

function createHarness(
  terminal: Promise<TurnExecutionTerminal>,
  options: { durable?: boolean; messages?: MessageStore } = {},
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
    modelPolicy: (requestedModelId, requestedReasoningEffort) => ({
      modelId: requestedModelId ?? "test-model",
      ...(requestedReasoningEffort === undefined
        ? {}
        : { reasoningEffort: requestedReasoningEffort }),
    }),
    admission,
    turns: state,
    execution,
    ...(options.durable
      ? {}
      : {
          routeFinalization: {
            turns: state,
            messages: options.messages ?? state,
          },
        }),
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
    requestedModelId: "test-model",
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
