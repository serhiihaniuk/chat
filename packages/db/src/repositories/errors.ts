export type DbRepositoryErrorCode =
  | "cross_tenant_access_denied"
  | "record_not_found"
  | "invalid_transition"
  | "event_log_conflict";

export class DbRepositoryError extends Error {
  constructor(
    readonly code: DbRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DbRepositoryError";
  }
}
