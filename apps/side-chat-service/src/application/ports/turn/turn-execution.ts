import type {
  TurnExecutionErrorCode,
  TurnMessage,
  TurnOutputEvent,
  TurnRef,
  TurnTerminalStatus,
  TurnUsage,
} from "#domain/turn/turn";

export type TurnExecutionInput = TurnRef &
  Readonly<{
    requestId: string;
    modelId: string;
    messages: readonly TurnMessage[];
    clientTools: readonly unknown[];
  }>;

export type TurnExecutionTerminal = Readonly<{
  status: TurnTerminalStatus;
  stepUsage: readonly TurnUsage[];
  assistantMessage?: TurnMessage;
  safeErrorCode?: TurnExecutionErrorCode;
}>;

export type StartedTurnExecution = Readonly<{
  runId: string;
  stream: ReadableStream<TurnOutputEvent>;
  terminal: Promise<TurnExecutionTerminal>;
}>;

export interface TurnExecution {
  start(input: TurnExecutionInput): Promise<StartedTurnExecution>;
  cancel(runId: string): Promise<void>;
}
