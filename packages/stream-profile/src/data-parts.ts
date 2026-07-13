/**
 * The browser-safe native message metadata carried by a terminal finish chunk.
 * This is deliberately not a `data-*` part: the AI SDK message metadata field
 * is the narrow extension point for folded turn usage, and the scrub edge
 * validates it before it reaches the browser.
 */
export type SideChatMessageMetadata = Readonly<{
  usage: Readonly<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  }>;
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

const SIDE_CHAT_MESSAGE_METADATA_JSON_SCHEMA = {
  type: "object",
  properties: {
    usage: {
      type: "object",
      properties: {
        inputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        outputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        totalTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        reasoningTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        cachedInputTokens: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
      required: ["inputTokens", "outputTokens", "totalTokens"],
      additionalProperties: false,
    },
  },
  required: ["usage"],
  additionalProperties: false,
} as const satisfies Readonly<Record<string, unknown>>;

/**
 * Standard Schema-compatible runtime validation for native message metadata.
 * Unknown fields and non-integer token values are rejected; successful parses
 * return a fresh object so private input cannot survive through the boundary.
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

/** The Side Chat `data-*` part surface; native metadata is not a data part. */
export type SideChatDataParts = Readonly<Record<never, never>>;

/** The pinned UI message stream protocol version. Both sides move together. */
export const SIDE_CHAT_STREAM_PROTOCOL = {
  HEADER: "x-vercel-ai-ui-message-stream",
  VERSION: "v1",
} as const;

function parseMessageMetadata(value: unknown): SideChatMessageMetadata | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["usage"])) return undefined;
  const usage = parseUsage(value["usage"]);
  return usage === undefined ? undefined : { usage };
}

function parseUsage(value: unknown): SideChatMessageMetadata["usage"] | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !hasOnlyKeys(value, [
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "reasoningTokens",
      "cachedInputTokens",
    ])
  ) {
    return undefined;
  }

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

  const normalizedUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number | undefined;
    cachedInputTokens?: number | undefined;
  } = {
    inputTokens,
    outputTokens,
    totalTokens,
  };
  if (typeof reasoningTokens === "number") normalizedUsage.reasoningTokens = reasoningTokens;
  if (typeof cachedInputTokens === "number") normalizedUsage.cachedInputTokens = cachedInputTokens;
  return normalizedUsage;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key));
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function invalidMetadata(): SideChatSchemaResult {
  return { issues: [{ message: "Message metadata is invalid." }] };
}
