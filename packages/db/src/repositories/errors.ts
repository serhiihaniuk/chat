export type DbRepositoryErrorCode =
  | "cross_tenant_access_denied"
  | "record_not_found"
  | "invalid_transition"
  // A second turn tried to start while one is already running for the
  // conversation. Raised when the `assistant_turns_one_running_per_conversation_uq`
  // partial unique index rejects the concurrent insert (the race-safe busy guard).
  | "conversation_busy";

export class DbRepositoryError extends Error {
  constructor(
    readonly code: DbRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DbRepositoryError";
  }
}
