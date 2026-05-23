import type { RuntimeEvent } from "../events.js";
import type { AssistantProvider, RuntimeRequest } from "../provider.js";

export const FAKE_PROVIDER_ID = "fake" as const;
export const FAKE_ECHO_MODEL_ID = "fake-echo" as const;

export type FakeProviderOptions = {
  readonly providerId?: string;
  readonly modelIds?: readonly string[];
  readonly script?: FakeRuntimeScript;
};

export type FakeRuntimeScript = (
  request: RuntimeRequest,
) => readonly RuntimeEvent[];

export const createFakeProvider = (
  options: FakeProviderOptions = {},
): AssistantProvider => {
  const providerId = options.providerId ?? FAKE_PROVIDER_ID;
  const modelIds = options.modelIds ?? [FAKE_ECHO_MODEL_ID];
  const script = options.script ?? createDeterministicEchoScript(providerId);

  return {
    providerId,
    modelIds,
    async *stream(request) {
      await Promise.resolve();
      for (const event of script(request)) yield event;
    },
  };
};

export const createDeterministicEchoScript = (
  providerId: string = FAKE_PROVIDER_ID,
): FakeRuntimeScript => {
  return (request) => {
    const userText = lastUserMessage(request)?.content ?? "";
    const answer =
      userText.length > 0 ? `Fake response: ${userText}` : "Fake response.";
    const words = answer.split(" ");
    const started: RuntimeEvent = {
      type: "runtime.started",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 0,
      providerId,
      modelId: request.modelId,
    };
    const reasoning: RuntimeEvent = {
      type: "runtime.reasoning",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 1,
      summary: "fake-provider selected deterministic echo script",
    };
    const deltas = words.map<RuntimeEvent>((word, index) => ({
      type: "runtime.output_delta",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: index + 2,
      content: index === words.length - 1 ? word : `${word} `,
    }));
    const completed: RuntimeEvent = {
      type: "runtime.completed",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: deltas.length + 2,
      finishReason: "stop",
      usage: {
        inputTokens: countTokens(userText),
        outputTokens: countTokens(answer),
        totalTokens: countTokens(userText) + countTokens(answer),
      },
    };
    return [started, reasoning, ...deltas, completed];
  };
};

const lastUserMessage = (request: RuntimeRequest) =>
  [...request.messages].reverse().find((message) => message.role === "user");

const countTokens = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;
