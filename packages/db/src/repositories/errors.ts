/**
 * The typed failure codes a repository raises. Named here so call sites and tests
 * reference the constant instead of repeating the string literal, and the union
 * type stays derived from a single source.
 */
export const DB_REPOSITORY_ERROR_CODES = {
  CROSS_TENANT_ACCESS_DENIED: "cross_tenant_access_denied",
  RECORD_NOT_FOUND: "record_not_found",
  INVALID_TRANSITION: "invalid_transition",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  // A second turn tried to start while one is already open for the conversation.
  // Raised when the one-open-per-conversation partial unique index rejects the
  // concurrent insert (the race-safe busy guard).
  CONVERSATION_BUSY: "conversation_busy",
} as const;

export type DbRepositoryErrorCode =
  (typeof DB_REPOSITORY_ERROR_CODES)[keyof typeof DB_REPOSITORY_ERROR_CODES];

export class DbRepositoryError extends Error {
  constructor(
    readonly code: DbRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DbRepositoryError";
  }
}
