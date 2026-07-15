import type { UIMessageChunk } from "ai";

import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";

export const TEST_RUN_ID = "run-1";

/** Deterministic route-level execution fixture with observable starts and cancels. */
export class ControlledTurnExecution implements TurnExecution {
  readonly started: TurnExecutionInput[] = [];
  readonly cancelled: string[] = [];

  constructor(
    private readonly stream: ReadableStream<UIMessageChunk>,
    private readonly terminal: Promise<TurnExecutionTerminal>,
  ) {}

  start(input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    return Promise.resolve({ runId: TEST_RUN_ID, stream: this.stream, terminal: this.terminal });
  }

  resume(runId: string, input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    return Promise.resolve({ runId, stream: this.stream, terminal: this.terminal });
  }

  cancel(runId: string): Promise<void> {
    this.cancelled.push(runId);
    return Promise.resolve();
  }
}

export function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

export function deferred<T>(): PromiseWithResolvers<T> {
  return Promise.withResolvers<T>();
}

export function neverTerminal(): Promise<TurnExecutionTerminal> {
  return new Promise(() => undefined);
}
