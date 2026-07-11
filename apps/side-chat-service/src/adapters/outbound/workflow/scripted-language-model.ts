import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";

export type ProviderScriptMode = "complete" | "block";

export const LATE_CONTENT_MARKER = "late-content-after-abort";

/**
 * Marker prefix for provider-side observations. The scripted model executes on
 * the host side of the workflow step boundary, in a bundle separate from the
 * HTTP routes, so observations are published as structured stdout lines and
 * asserted by the compatibility suite from the captured service output.
 */
export const PROVIDER_OBSERVATION_PREFIX = "[compatibility-observation]";

interface SerializedScriptedModel {
  readonly requestId: string;
  readonly mode: ProviderScriptMode;
}

export function createScriptedLanguageModel(
  requestId: string,
  mode: ProviderScriptMode,
): LanguageModelV4 {
  return new ScriptedLanguageModel(requestId, mode);
}

/**
 * Deterministic credential-free provider for the compatibility suite.
 * `complete` streams a scripted reply and finishes; `block` streams two deltas
 * and then hangs until the abort signal fires, mimicking a stuck provider call.
 *
 * Serialization converts the model from a workflow value to a host-step value.
 * The custom serde methods preserve only the request id and scripted mode;
 * provider execution state never crosses that boundary.
 */
class ScriptedLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "side-chat-scripted";
  readonly modelId = "workflow-compatibility";
  readonly supportedUrls = {};

  constructor(
    readonly requestId: string,
    readonly mode: ProviderScriptMode,
  ) {}

  static [WORKFLOW_SERIALIZE](instance: ScriptedLanguageModel): SerializedScriptedModel {
    return { requestId: instance.requestId, mode: instance.mode };
  }

  static [WORKFLOW_DESERIALIZE](data: SerializedScriptedModel): ScriptedLanguageModel {
    return new ScriptedLanguageModel(data.requestId, data.mode);
  }

  doGenerate(_options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4GenerateResult> {
    throw new Error("The compatibility model supports streaming only");
  }

  doStream(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4StreamResult> {
    return Promise.resolve({
      stream:
        this.mode === "complete"
          ? completedStream(`Scripted reply: ${this.requestId}`)
          : blockingStream(this.requestId, options.abortSignal),
    });
  }
}

function completedStream(text: string): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of completedParts(text)) controller.enqueue(part);
      controller.close();
    },
  });
}

function blockingStream(
  requestId: string,
  abortSignal: AbortSignal | undefined,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "blocked-text" });
      controller.enqueue({ type: "text-delta", id: "blocked-text", delta: "streaming before " });
      controller.enqueue({ type: "text-delta", id: "blocked-text", delta: "the abort" });
      recordProviderObservation({ event: "provider-streaming", requestId });

      // The error must carry the AbortError name: the workflow engine treats a
      // step failing with a generic error (for example the raw abort-reason
      // string) as retryable and re-runs the provider call.
      const abort = () => {
        controller.error(new DOMException(abortReasonText(abortSignal), "AbortError"));
        recordProviderObservation({
          event: "provider-aborted",
          requestId,
          abortObserved: true,
          lateContentAccepted: attemptLateContent(controller),
        });
      };
      if (abortSignal?.aborted) abort();
      else abortSignal?.addEventListener("abort", abort, { once: true });
      // Intentionally never close(): the "request" hangs until aborted.
    },
  });
}

function abortReasonText(abortSignal: AbortSignal | undefined): string {
  const reason: unknown = abortSignal?.reason;
  return typeof reason === "string" ? reason : "Provider call aborted";
}

/** A rogue provider push after abort; the errored stream must reject it. */
function attemptLateContent(
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
): boolean {
  try {
    controller.enqueue({ type: "text-delta", id: "blocked-text", delta: LATE_CONTENT_MARKER });
    return true;
  } catch {
    return false;
  }
}

function recordProviderObservation(observation: Record<string, unknown>): void {
  console.log(`${PROVIDER_OBSERVATION_PREFIX} ${JSON.stringify(observation)}`);
}

function completedParts(text: string): ReadonlyArray<LanguageModelV4StreamPart> {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "scripted-text" },
    { type: "text-delta", id: "scripted-text", delta: text },
    { type: "text-end", id: "scripted-text" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
    },
  ];
}
