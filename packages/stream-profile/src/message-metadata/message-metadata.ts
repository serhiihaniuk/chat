import { isSideChatErrorCode } from "../error-vocabulary.js";
import { isSideChatFinishReason } from "../finish-reasons.js";
import { SIDE_CHAT_MESSAGE_METADATA_JSON_SCHEMA } from "./message-metadata-json-schema.js";
import {
  SIDE_CHAT_MESSAGE_TERMINAL_STATUSES,
  type SideChatMessageTerminal,
} from "./message-terminal.js";

/** Browser-safe native metadata for folded turn usage and durable terminal state. */
export type SideChatMessageMetadata = Readonly<{
  usage: Readonly<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  }>;
  activityDurationMs?: number | undefined;
  terminal?: SideChatMessageTerminal | undefined;
}>;

type SideChatSchemaIssue = Readonly<{
  message: string;
  path?: readonly PropertyKey[] | undefined;
}>;

type SideChatSchemaResult =
  | Readonly<{ value: SideChatMessageMetadata | undefined }>
  | Readonly<{ issues: readonly SideChatSchemaIssue[] }>;

type SideChatMessageMetadataSchema = Readonly<{
  "~standard": Readonly<{
    version: 1;
    vendor: "side-chat";
    validate: (
      value: unknown,
      options?: Readonly<{
        libraryOptions?: Record<string, unknown> | undefined;
      }>,
    ) => SideChatSchemaResult;
    jsonSchema: Readonly<{
      input: (
        options: Readonly<{
          target: string;
          libraryOptions?: Record<string, unknown> | undefined;
        }>,
      ) => Readonly<Record<string, unknown>>;
      output: (
        options: Readonly<{
          target: string;
          libraryOptions?: Record<string, unknown> | undefined;
        }>,
      ) => Readonly<Record<string, unknown>>;
    }>;
  }>;
}>;

/**
 * Standard Schema-compatible validation for native message metadata. Unknown
 * fields and non-integer token values are rejected, and successful parses return
 * a fresh object so private input cannot survive through the browser boundary.
 */
export const sideChatMessageMetadataSchema: SideChatMessageMetadataSchema = {
  "~standard": {
    version: 1,
    vendor: "side-chat",
    validate(value) {
      if (value === undefined) return { value: undefined };
      const metadata = parseMessageMetadata(value);
      return metadata === undefined ? invalidMetadata() : { value: metadata };
    },
    jsonSchema: {
      input: () => SIDE_CHAT_MESSAGE_METADATA_JSON_SCHEMA,
      output: () => SIDE_CHAT_MESSAGE_METADATA_JSON_SCHEMA,
    },
  },
};

function parseMessageMetadata(value: unknown): SideChatMessageMetadata | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["usage", "activityDurationMs", "terminal"])) {
    return undefined;
  }
  const usage = parseUsage(value["usage"]);
  if (usage === undefined) return undefined;
  const activityDurationMs = value["activityDurationMs"];
  if ("activityDurationMs" in value && !isSafeNonNegativeInteger(activityDurationMs)) {
    return undefined;
  }
  const terminal = parseMessageTerminal(value["terminal"]);
  if ("terminal" in value && terminal === undefined) return undefined;
  const metadata: {
    usage: SideChatMessageMetadata["usage"];
    activityDurationMs?: number;
    terminal?: SideChatMessageTerminal;
  } = { usage };
  if (typeof activityDurationMs === "number") metadata.activityDurationMs = activityDurationMs;
  if (terminal !== undefined) metadata.terminal = terminal;
  return metadata;
}

function parseMessageTerminal(value: unknown): SideChatMessageTerminal | undefined {
  if (!isRecord(value) || typeof value["status"] !== "string") return undefined;
  const status = value["status"];
  if (status === SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED) {
    return hasOnlyKeys(value, ["status"]) ? { status } : undefined;
  }
  if (status === SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED) return parseFailedTerminal(value);
  if (status === SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED) {
    return parseCompletedTerminal(value);
  }
  return undefined;
}

function parseFailedTerminal(value: Record<string, unknown>): SideChatMessageTerminal | undefined {
  const errorCode = value["errorCode"];
  return hasOnlyKeys(value, ["status", "errorCode"]) &&
    typeof errorCode === "string" &&
    isSideChatErrorCode(errorCode)
    ? { status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED, errorCode }
    : undefined;
}

function parseCompletedTerminal(
  value: Record<string, unknown>,
): SideChatMessageTerminal | undefined {
  if (!hasOnlyKeys(value, ["status", "finishReason"])) return undefined;
  const status = SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED;
  if (!("finishReason" in value)) return { status };
  const finishReason = value["finishReason"];
  return isSideChatFinishReason(finishReason) ? { status, finishReason } : undefined;
}

function parseUsage(value: unknown): SideChatMessageMetadata["usage"] | undefined {
  if (!isRecord(value)) return undefined;
  const allowedKeys = [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "reasoningTokens",
    "cachedInputTokens",
  ];
  if (!hasOnlyKeys(value, allowedKeys)) return undefined;

  const inputTokens = value["inputTokens"];
  const outputTokens = value["outputTokens"];
  const totalTokens = value["totalTokens"];
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens) || !isTokenCount(totalTokens)) {
    return undefined;
  }
  const reasoningTokens = value["reasoningTokens"];
  const cachedInputTokens = value["cachedInputTokens"];
  if (
    ("reasoningTokens" in value && !isTokenCount(reasoningTokens)) ||
    ("cachedInputTokens" in value && !isTokenCount(cachedInputTokens))
  ) {
    return undefined;
  }
  const usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  } = { inputTokens, outputTokens, totalTokens };
  if (typeof reasoningTokens === "number") usage.reasoningTokens = reasoningTokens;
  if (typeof cachedInputTokens === "number") usage.cachedInputTokens = cachedInputTokens;
  return usage;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key));
}

function isTokenCount(value: unknown): value is number {
  return isSafeNonNegativeInteger(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function invalidMetadata(): SideChatSchemaResult {
  return { issues: [{ message: "Message metadata is invalid." }] };
}
