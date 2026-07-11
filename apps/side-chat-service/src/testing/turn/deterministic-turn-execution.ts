import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
} from "#application/ports/turn/turn-execution";
import { TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

export class DeterministicTurnExecution implements TurnExecution {
  readonly started: TurnExecutionInput[] = [];
  readonly cancelled: string[] = [];

  constructor(private readonly startFailure?: Error) {}

  start(input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    if (this.startFailure) return Promise.reject(this.startFailure);
    return Promise.resolve({
      runId: `run-${input.turnId}`,
      stream: new ReadableStream({ start: (controller) => controller.close() }),
      terminal: Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [],
      }),
    });
  }

  cancel(runId: string): Promise<void> {
    this.cancelled.push(runId);
    return Promise.resolve();
  }
}
