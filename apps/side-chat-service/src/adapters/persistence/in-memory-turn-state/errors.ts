import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";

export function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Unexpected in-memory turn-state failure", { cause: error });
}

export function runNotFound(): TurnRejectedError {
  return new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
}
