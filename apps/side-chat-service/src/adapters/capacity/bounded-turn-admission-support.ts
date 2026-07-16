import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";

const CAPACITY_RETRY_AFTER_SECONDS = 5;
const CAPACITY_REJECTION_MESSAGE = "Turn capacity is temporarily exhausted";
const DRAINING_REJECTION_MESSAGE = "Service is draining and cannot accept new turns";

export function capacityError(): TurnRejectedError {
  return new TurnRejectedError(
    TURN_REJECTION_CODES.CAPACITY,
    CAPACITY_REJECTION_MESSAGE,
    CAPACITY_RETRY_AFTER_SECONDS,
  );
}

export function drainingError(): TurnRejectedError {
  return new TurnRejectedError(
    TURN_REJECTION_CODES.CAPACITY,
    DRAINING_REJECTION_MESSAGE,
    CAPACITY_RETRY_AFTER_SECONDS,
  );
}

export function abortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Turn admission was cancelled", "AbortError");
}

export function requirePositiveInteger(value: number, name: string): void {
  if (Number.isSafeInteger(value) && value > 0) return;
  throw new TypeError(`${name} must be a positive integer`);
}

export function requireNonNegativeInteger(value: number, name: string): void {
  if (Number.isSafeInteger(value) && value >= 0) return;
  throw new TypeError(`${name} must be a non-negative integer`);
}
