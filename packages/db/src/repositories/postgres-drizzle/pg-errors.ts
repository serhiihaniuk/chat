import { isRecord } from "@side-chat/shared";

/** Postgres `unique_violation` SQLSTATE. */
const UNIQUE_VIOLATION_CODE = "23505";

/**
 * The violated unique/primary-key constraint name, when `error` is a Postgres
 * unique violation (SQLSTATE `23505`); otherwise `undefined`.
 *
 * Drizzle wraps the driver error in a `DrizzleQueryError`, so the pg fields
 * (`code`, `constraint`) live on `.cause`; a raw pg error carries them directly.
 * Checking both shapes keeps detection robust either way.
 *
 * Exported so a caller that owns a higher-level meaning for a specific
 * constraint (for example, a cross-subject conversation-id collision on
 * `conversations_pkey`) can map it without re-deriving the unwrapping.
 */
export const uniqueViolationConstraint = (error: unknown): string | undefined => {
  const candidates = [error, isRecord(error) ? error["cause"] : undefined];
  for (const candidate of candidates) {
    if (isRecord(candidate) && candidate["code"] === UNIQUE_VIOLATION_CODE) {
      const constraint = candidate["constraint"];
      if (typeof constraint === "string") return constraint;
    }
  }
  return undefined;
};
