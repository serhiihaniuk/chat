import type { JsonObject, JsonValue } from "@side-chat/shared";
import type { RepositoryCommandResult } from "#schema-contract";
import { randomUUID } from "node:crypto";
import { DbRepositoryError } from "./errors.js";

export const result = <RecordType>(
  record: RecordType,
  inserted: boolean,
): RepositoryCommandResult<RecordType> => ({ record, inserted });

/** Collapse a nullable SQL column to the record contract's optional value. */
export const optional = <Value>(value: Value | null | undefined): Value | undefined =>
  value === null || value === undefined ? undefined : value;

/** Take the single expected row or fail with the typed repository error. */
export const one = <RecordType>(
  rows: readonly RecordType[],
  code: DbRepositoryError["code"],
  message: string,
): RecordType => {
  const row = rows[0];
  if (!row) throw new DbRepositoryError(code, message);
  return row;
};

/**
 * Compare two JSON values for the turn-event idempotency check.
 *
 * Object keys are ordered before serializing because a payload round-tripped
 * through JSONB may come back with reordered keys; without this an identical
 * re-append would look like a payload conflict. Arrays keep their order.
 */
export const jsonValueEquals = (left: JsonValue, right: JsonValue): boolean =>
  canonicalJson(left) === canonicalJson(right);

const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as JsonObject;
  const entries = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`);
  return `{${entries.join(",")}}`;
};

export const createIdGenerator = (prefix: string) => {
  let index = 0;
  return {
    next: (kind: string): string => {
      index += 1;
      return `${prefix}_${kind}_${index.toString().padStart(4, "0")}`;
    },
  };
};

export const createRandomIdGenerator = (prefix: string) => ({
  next: (kind: string): string => `${prefix}_${kind}_${randomUUID()}`,
});
