import { AssistantRuntimeError } from "../errors.js";
import type {
  RuntimeErrorCode,
  RuntimeEvent,
  RuntimeUsage,
} from "../events.js";
import type { AssistantProvider, RuntimeRequest } from "../provider.js";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAIResponsesProviderOptions = {
  readonly apiKey: string;
  readonly modelIds: readonly string[];
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly store?: boolean;
};

type OpenAIUsage = {
  readonly input_tokens?: unknown;
  readonly output_tokens?: unknown;
  readonly total_tokens?: unknown;
};

type OpenAIStreamEvent = {
  readonly type?: unknown;
  readonly delta?: unknown;
  readonly response?: {
    readonly usage?: OpenAIUsage;
  };
  readonly error?: {
    readonly message?: unknown;
  };
};

export const createOpenAIResponsesProvider = (
  options: OpenAIResponsesProviderOptions,
): AssistantProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new AssistantRuntimeError(
      "provider_unavailable",
      "OpenAI provider requires an API key.",
    );
  }
  if (options.modelIds.length === 0) {
    throw new AssistantRuntimeError(
      "model_unavailable",
      "OpenAI provider requires at least one allowed model id.",
    );
  }

  const providerFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? OPENAI_RESPONSES_URL;

  return {
    providerId: OPENAI_PROVIDER_ID,
    modelIds: options.modelIds,
    async *stream(request) {
      const response = await providerFetch(baseUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          "x-client-request-id": request.requestId,
        },
        body: JSON.stringify({
          model: request.modelId,
          input: request.messages.map(toOpenAIInputMessage),
          stream: true,
          store: options.store ?? false,
        }),
      });

      if (!response.ok || !response.body) {
        yield runtimeError(request, 0, "provider_unavailable", response.status);
        return;
      }

      let sequence = 0;
      yield {
        type: "runtime.started",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        providerId: OPENAI_PROVIDER_ID,
        modelId: request.modelId,
      };
      sequence += 1;

      for await (const event of parseSseEvents(response.body)) {
        const mapped = mapOpenAIEvent(request, event, sequence);
        if (!mapped) continue;
        yield mapped;
        sequence += 1;
        if (
          mapped.type === "runtime.completed" ||
          mapped.type === "runtime.error"
        ) {
          return;
        }
      }

      yield runtimeError(request, sequence, "internal_error", "stream ended");
    },
  };
};

const toOpenAIInputMessage = (message: RuntimeRequest["messages"][number]) => ({
  role: message.role,
  content: message.content,
});

const mapOpenAIEvent = (
  request: RuntimeRequest,
  event: OpenAIStreamEvent,
  sequence: number,
): RuntimeEvent | undefined => {
  switch (event.type) {
    case "response.output_text.delta":
      return {
        type: "runtime.output_delta",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        content: typeof event.delta === "string" ? event.delta : "",
      };
    case "response.completed": {
      const usage = toUsage(event.response?.usage);
      return {
        type: "runtime.completed",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        finishReason: "stop",
        ...(usage ? { usage } : {}),
      };
    }
    case "response.failed":
    case "error":
      return runtimeError(
        request,
        sequence,
        "provider_unavailable",
        event.error?.message ?? "OpenAI response failed",
      );
    default:
      return undefined;
  }
};

const toUsage = (usage: OpenAIUsage | undefined): RuntimeUsage | undefined => {
  if (!usage) return undefined;
  const inputTokens = numeric(usage.input_tokens);
  const outputTokens = numeric(usage.output_tokens);
  const totalTokens = numeric(usage.total_tokens);
  return { inputTokens, outputTokens, totalTokens };
};

const numeric = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const runtimeError = (
  request: RuntimeRequest,
  sequence: number,
  code: RuntimeErrorCode,
  message: unknown,
): RuntimeEvent => ({
  type: "runtime.error",
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence,
  code,
  message: typeof message === "string" ? message : "OpenAI provider failed.",
  retryable: true,
});

async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<OpenAIStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parts = buffer.split(/\n\n/u);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const parsed = parseSsePart(part);
      if (parsed) yield parsed;
    }

    if (done) break;
  }

  const trailing = parseSsePart(buffer);
  if (trailing) yield trailing;
}

const parseSsePart = (part: string): OpenAIStreamEvent | undefined => {
  const data = part
    .split(/\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (data.length === 0 || data === "[DONE]") return undefined;

  try {
    return JSON.parse(data) as OpenAIStreamEvent;
  } catch {
    return { type: "error", error: { message: "Malformed OpenAI SSE event." } };
  }
};
