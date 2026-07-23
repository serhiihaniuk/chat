/**
 * Strict wire validation for the iframe host-context `postMessage` protocol.
 *
 * Messages accept exact keys, non-empty identities, valid timestamps, and
 * bounded JSON metadata. Window source and exact-origin checks live in the
 * connection adapters; these parsers validate payload shape only.
 */
import {
  isRecord,
  omitUndefinedProperties,
  type JsonObject,
  type JsonValue,
} from "@side-chat/shared";

import type { HostContextRequest, HostContextSnapshot, HostSurface } from "./host-context.js";

export const IFRAME_HOST_CONTEXT_MESSAGE = {
  AVAILABLE: "sidechat.host-context.available.v1",
  CONNECT: "sidechat.host-context.connect.v1",
  REQUEST: "sidechat.host-context.request.v1",
  RESPONSE: "sidechat.host-context.response.v1",
} as const;

const DEFAULT_TIMEOUT_MS = 1_000;
const MAX_METADATA_DEPTH = 16;
const MAX_METADATA_ENTRIES = 4_096;
const CONNECT_MESSAGE_KEYS = ["type", "connectionId"] as const;
const REQUEST_MESSAGE_KEYS = ["type", "connectionId", "correlationId", "request"] as const;
const RESPONSE_FAILURE_KEYS = ["type", "connectionId", "correlationId", "ok"] as const;
const RESPONSE_SUCCESS_KEYS = [...RESPONSE_FAILURE_KEYS, "snapshot"] as const;
const SNAPSHOT_KEYS = [
  "schemaVersion",
  "origin",
  "url",
  "title",
  "metadata",
  "collectedAt",
  "expiresAt",
  "surface",
  "capabilityHash",
] as const;
const SURFACE_KEYS = ["surfaceId", "resourceType", "resourceId"] as const;
const INVALID_VALUE = Symbol("invalid-value");

export type IframeContextRequestMessage = Readonly<{
  connectionId: string;
  correlationId: string;
  request: HostContextRequest;
}>;

export type IframeContextResponse =
  | Readonly<{ ok: false }>
  | Readonly<{ ok: true; snapshot: unknown }>;

export function isIframeConnectMessage(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CONNECT_MESSAGE_KEYS) &&
    value["type"] === IFRAME_HOST_CONTEXT_MESSAGE.CONNECT
  );
}

export function readIframeContextRequestMessage(
  message: Record<string, unknown>,
  activeConnectionId: string | undefined,
): IframeContextRequestMessage | undefined {
  if (!hasOnlyKeys(message, REQUEST_MESSAGE_KEYS)) return undefined;
  const connectionId = readId(message["connectionId"]);
  const correlationId = readId(message["correlationId"]);
  const request = readHostContextRequest(message["request"]);
  if (!connectionId || connectionId !== activeConnectionId || !correlationId || !request) {
    return undefined;
  }
  return { connectionId, correlationId, request };
}

export function readIframeContextResponse(
  value: unknown,
  connectionId: string,
  correlationId: string,
): IframeContextResponse | undefined {
  if (!isRecord(value) || value["type"] !== IFRAME_HOST_CONTEXT_MESSAGE.RESPONSE) {
    return undefined;
  }
  if (value["connectionId"] !== connectionId || value["correlationId"] !== correlationId) {
    return undefined;
  }
  if (value["ok"] === false) {
    return hasOnlyKeys(value, RESPONSE_FAILURE_KEYS) ? { ok: false } : undefined;
  }
  if (value["ok"] !== true || !hasOnlyKeys(value, RESPONSE_SUCCESS_KEYS)) return undefined;
  return { ok: true, snapshot: value["snapshot"] };
}

export function isMatchingIframeConnectionMessage(
  value: unknown,
  type: string,
  connectionId: string,
): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CONNECT_MESSAGE_KEYS) &&
    value["type"] === type &&
    value["connectionId"] === connectionId
  );
}

export function parseIframeHostContextSnapshot(value: unknown): HostContextSnapshot | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, SNAPSHOT_KEYS)) return undefined;
  const schemaVersion = readId(value["schemaVersion"]);
  const collectedAt = readTimestamp(value["collectedAt"]);
  const origin = readOptionalString(value["origin"]);
  const url = readOptionalString(value["url"]);
  const title = readOptionalString(value["title"]);
  const expiresAt = readOptionalTimestamp(value["expiresAt"]);
  const capabilityHash = readOptionalString(value["capabilityHash"]);
  const metadata = readOptionalJsonObject(value["metadata"]);
  const surface = readOptionalSurface(value["surface"]);
  if (
    !schemaVersion ||
    !collectedAt ||
    origin === INVALID_VALUE ||
    url === INVALID_VALUE ||
    title === INVALID_VALUE ||
    expiresAt === INVALID_VALUE ||
    capabilityHash === INVALID_VALUE ||
    metadata === INVALID_VALUE ||
    surface === INVALID_VALUE
  ) {
    return undefined;
  }
  return omitUndefinedProperties({
    schemaVersion,
    collectedAt,
    origin,
    url,
    title,
    expiresAt,
    capabilityHash,
    metadata,
    surface,
  });
}

export function readIframeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be positive.");
  }
  return timeoutMs;
}

export function assertExactIframeOrigin(origin: string): void {
  let parsedOrigin: string | undefined;
  try {
    parsedOrigin = new URL(origin).origin;
  } catch {
    parsedOrigin = undefined;
  }
  if (parsedOrigin !== origin) throw new Error("An exact iframe origin is required.");
}

function readHostContextRequest(value: unknown): HostContextRequest | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["requestId", "now"])) return undefined;
  const requestId = readId(value["requestId"]);
  const now = value["now"];
  if (!requestId || (now !== undefined && typeof now !== "string")) return undefined;
  return omitUndefinedProperties({ requestId, now });
}

function readOptionalSurface(value: unknown): HostSurface | undefined | typeof INVALID_VALUE {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !hasOnlyKeys(value, SURFACE_KEYS)) return INVALID_VALUE;
  const surfaceId = readId(value["surfaceId"]);
  const resourceType = readOptionalString(value["resourceType"]);
  const resourceId = readOptionalString(value["resourceId"]);
  if (!surfaceId || resourceType === INVALID_VALUE || resourceId === INVALID_VALUE) {
    return INVALID_VALUE;
  }
  return omitUndefinedProperties({ surfaceId, resourceType, resourceId });
}

function readOptionalJsonObject(value: unknown): JsonObject | undefined | typeof INVALID_VALUE {
  if (value === undefined) return undefined;
  return isJsonObject(value, 0, { entries: 0 }) ? value : INVALID_VALUE;
}

type JsonValidationBudget = { entries: number };

function isJsonObject(
  value: unknown,
  depth: number,
  budget: JsonValidationBudget,
): value is JsonObject {
  if (!isRecord(value) || depth > MAX_METADATA_DEPTH) return false;
  const entries = Object.values(value);
  if (!reserveJsonEntries(entries.length, budget)) return false;
  return entries.every((entry) => isJsonValue(entry, depth + 1, budget));
}

function isJsonValue(
  value: unknown,
  depth: number,
  budget: JsonValidationBudget,
): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (depth > MAX_METADATA_DEPTH || !reserveJsonEntries(value.length, budget)) return false;
    return value.every((entry) => isJsonValue(entry, depth + 1, budget));
  }
  return isJsonObject(value, depth, budget);
}

function reserveJsonEntries(count: number, budget: JsonValidationBudget): boolean {
  budget.entries += count;
  return budget.entries <= MAX_METADATA_ENTRIES;
}

function readOptionalString(value: unknown): string | undefined | typeof INVALID_VALUE {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : INVALID_VALUE;
}

function readOptionalTimestamp(value: unknown): string | undefined | typeof INVALID_VALUE {
  if (value === undefined) return undefined;
  return readTimestamp(value) ?? INVALID_VALUE;
}

function readTimestamp(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function readId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
