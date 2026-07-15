import type { UIMessageChunk } from "ai";

import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
} from "#application/ports/turn/turn-execution";
import { TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

export class DeterministicTurnExecution implements TurnExecution {
  readonly started: TurnExecutionInput[] = [];
  readonly resumed: Array<Readonly<{ runId: string; input: TurnExecutionInput }>> = [];
  readonly cancelled: string[] = [];

  constructor(private readonly startFailure?: Error) {}

  start(input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    if (this.startFailure) return Promise.reject(this.startFailure);
    return Promise.resolve(this.execution(`run-${input.turnId}`));
  }

  resume(runId: string, input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.resumed.push({ runId, input });
    return Promise.resolve(this.execution(runId));
  }

  private execution(runId: string): StartedTurnExecution {
    return {
      runId,
      stream: new ReadableStream<UIMessageChunk>({ start: (controller) => controller.close() }),
      terminal: Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [],
      }),
    };
  }

  cancel(runId: string): Promise<void> {
    this.cancelled.push(runId);
    return Promise.resolve();
  }
}
