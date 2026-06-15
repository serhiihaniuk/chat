import {
  createBasicRuntimeAgent,
  RUNTIME_EVENT_TYPES,
  toAssistantTurnId,
  toRequestId,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import { Effect, Stream } from "effect";
import type { ConversationTitlePromptConfig } from "#ports";
import { recordStreamObservationEffect } from "../observability/stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";

const TITLE_MAX_WORDS = 6;
const TITLE_MIN_WORDS = 2;
const TITLE_MAX_LENGTH = 64;

const TITLE_FAILURE_REASONS = {
  PERSISTENCE_FAILED: "persistence_failed",
  RUNTIME_ERROR_EVENT: "runtime_error_event",
  RUNTIME_FAILED: "runtime_failed",
  RUNTIME_INCOMPLETE: "runtime_incomplete",
  UNEXPECTED_FAILURE: "unexpected_failure",
} as const;

const TITLE_SKIP_REASONS = {
  BLANK_ASSISTANT_CONTENT: "blank_assistant_content",
  BLANK_USER_MESSAGE: "blank_user_message",
  EXISTING_TITLE: "existing_title",
  INVALID_MODEL_OUTPUT: "invalid_model_output",
  INVALID_PROMPT_CONFIG: "invalid_prompt_config",
  NON_INITIAL_EXCHANGE: "non_initial_exchange",
} as const;

type TitleFailureReason = (typeof TITLE_FAILURE_REASONS)[keyof typeof TITLE_FAILURE_REASONS];
type TitleSkipReason = (typeof TITLE_SKIP_REASONS)[keyof typeof TITLE_SKIP_REASONS];

type RunnableTitleInput = {
  readonly prompt: ConversationTitlePromptConfig;
  readonly userContent: string;
  readonly assistantContent: string;
  readonly userPrompt: string;
};

type TitlePreparationInput =
  | {
      readonly status: "run";
      readonly input: RunnableTitleInput;
    }
  | {
      readonly status: "skip";
      readonly reason: TitleSkipReason;
    };

type TitleGenerationFailure = {
  readonly reason: TitleFailureReason;
};

export const prepareConversationTitleAfterCompletion = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  assistantContent: string,
): Effect.Effect<void, never> =>
  prepareConversationTitleAfterCompletionEffect(ports, input, turn, assistantContent).pipe(
    Effect.catch((error) =>
      recordTitleObservationSafe(ports, turn, "failed", titleFailureReason(error)),
    ),
  );

const prepareConversationTitleAfterCompletionEffect = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  assistantContent: string,
): Effect.Effect<void, TitleGenerationFailure> =>
  Effect.gen(function* () {
    if (ports.conversationTitleGeneration.mode === "disabled") return;

    const prepared = prepareTitleInput(
      ports.conversationTitleGeneration.prompt,
      input,
      turn,
      assistantContent,
    );
    if (prepared.status === "skip") {
      yield* recordTitleObservationSafe(ports, turn, "skipped", prepared.reason);
      return;
    }

    const rawTitle = yield* runConversationTitleAgent(ports, input, turn, prepared.input);
    const titleText = normalizeConversationTitle(rawTitle, prepared.input.userContent);
    if (!titleText) {
      yield* recordTitleObservationSafe(
        ports,
        turn,
        "skipped",
        TITLE_SKIP_REASONS.INVALID_MODEL_OUTPUT,
      );
      return;
    }

    yield* ports.conversations
      .prepareConversationTitle({
        authContext: turn.authContext,
        conversationId: turn.conversation.conversationId,
        titleText,
        now: ports.clock.now(),
      })
      .pipe(
        Effect.mapError(() => titleGenerationFailure(TITLE_FAILURE_REASONS.PERSISTENCE_FAILED)),
      );
    yield* recordTitleObservationSafe(ports, turn, "generated");
  });

const prepareTitleInput = (
  prompt: ConversationTitlePromptConfig,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  assistantContent: string,
): TitlePreparationInput => {
  if (turn.conversation.titleText?.trim()) {
    return { status: "skip", reason: TITLE_SKIP_REASONS.EXISTING_TITLE };
  }
  if (turn.userMessage.sequenceIndex !== 0) {
    return { status: "skip", reason: TITLE_SKIP_REASONS.NON_INITIAL_EXCHANGE };
  }
  if (!isPromptConfigured(prompt)) {
    return { status: "skip", reason: TITLE_SKIP_REASONS.INVALID_PROMPT_CONFIG };
  }

  const userContent = input.request.message.content.trim();
  if (!userContent) return { status: "skip", reason: TITLE_SKIP_REASONS.BLANK_USER_MESSAGE };

  const assistantText = assistantContent.trim();
  if (!assistantText) return { status: "skip", reason: TITLE_SKIP_REASONS.BLANK_ASSISTANT_CONTENT };

  return {
    status: "run",
    input: {
      prompt,
      userContent,
      assistantContent: assistantText,
      userPrompt: renderTitleUserPrompt(prompt, userContent, assistantText),
    },
  };
};

const isPromptConfigured = (prompt: ConversationTitlePromptConfig): boolean =>
  prompt.systemInstructions.trim().length > 0 &&
  prompt.taskInstructions.trim().length > 0 &&
  prompt.userMessageLabel.trim().length > 0 &&
  prompt.assistantResponseLabel.trim().length > 0;

const renderTitleUserPrompt = (
  prompt: ConversationTitlePromptConfig,
  userContent: string,
  assistantContent: string,
): string =>
  [
    prompt.taskInstructions.trim(),
    "",
    `${prompt.userMessageLabel.trim()}:`,
    userContent,
    "",
    `${prompt.assistantResponseLabel.trim()}:`,
    assistantContent,
  ].join("\n");

const runConversationTitleAgent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  titleInput: RunnableTitleInput,
): Effect.Effect<string, TitleGenerationFailure> => {
  const titleAgent = createBasicRuntimeAgent(ports.runtime, {
    providerId: turn.policyDecision.providerId,
    modelId: turn.policyDecision.modelId,
    systemInstructions: titleInput.prompt.systemInstructions,
    availableToolNames: [],
  });

  const titleEventStream = titleAgent
    .streamEffect({
      requestId: toRequestId(`${input.request.requestId}:conversation-title`),
      assistantTurnId: toAssistantTurnId(`${turn.assistantTurnId}:conversation-title`),
      messages: [{ role: "user", content: titleInput.userPrompt }],
      abortSignal: input.abortSignal,
    })
    .pipe(Stream.mapError(() => titleGenerationFailure(TITLE_FAILURE_REASONS.RUNTIME_FAILED)));

  return collectTitleOutput(titleEventStream);
};

const collectTitleOutput = (
  eventStream: Stream.Stream<RuntimeEvent, TitleGenerationFailure>,
): Effect.Effect<string, TitleGenerationFailure> =>
  Effect.gen(function* () {
    let output = "";
    let completed = false;
    let runtimeErrored = false;

    yield* Stream.runForEach(eventStream, (event) =>
      Effect.sync(() => {
        if (event.type === RUNTIME_EVENT_TYPES.OUTPUT_DELTA) output += event.content;
        if (event.type === RUNTIME_EVENT_TYPES.COMPLETED) completed = true;
        if (event.type === RUNTIME_EVENT_TYPES.ERROR) runtimeErrored = true;
      }),
    );

    if (runtimeErrored) {
      return yield* Effect.fail(titleGenerationFailure(TITLE_FAILURE_REASONS.RUNTIME_ERROR_EVENT));
    }
    if (!completed) {
      return yield* Effect.fail(titleGenerationFailure(TITLE_FAILURE_REASONS.RUNTIME_INCOMPLETE));
    }
    return output;
  });

const normalizeConversationTitle = (rawTitle: string, userContent: string): string | undefined => {
  const cleaned = stripGeneratedTitleNoise(rawTitle);
  const wordLimited = limitTitleWords(cleaned);
  const lengthLimited = limitTitleLength(wordLimited);
  const title = stripTrailingPunctuation(lengthLimited).trim();
  if (titleWordCount(title) < TITLE_MIN_WORDS) return undefined;
  if (isCopiedUserMessage(title, userContent)) return undefined;
  return title;
};

const stripGeneratedTitleNoise = (rawTitle: string): string =>
  rawTitle
    .split(/\r?\n/u)[0]
    ?.replace(/^\s*(?:title\s*:\s*)/iu, "")
    .replace(/^\s*[-*]\s*/u, "")
    .replace(/^["'`]+|["'`]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim() ?? "";

const limitTitleWords = (title: string): string =>
  title.split(/\s+/u).filter(Boolean).slice(0, TITLE_MAX_WORDS).join(" ");

const limitTitleLength = (title: string): string => {
  if (title.length <= TITLE_MAX_LENGTH) return title;

  const truncated = title.slice(0, TITLE_MAX_LENGTH).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
};

const stripTrailingPunctuation = (title: string): string => title.replace(/[.!?,:;]+$/u, "");

const titleWordCount = (title: string): number => title.split(/\s+/u).filter(Boolean).length;

const isCopiedUserMessage = (title: string, userContent: string): boolean =>
  comparisonText(title) === comparisonText(userContent);

const comparisonText = (text: string): string =>
  stripTrailingPunctuation(text).replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");

const recordTitleObservationSafe = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  status: "failed" | "generated" | "skipped",
  reason?: TitleFailureReason | TitleSkipReason,
): Effect.Effect<void, never> =>
  recordStreamObservationEffect(ports.observability, {
    correlation: turn.correlation,
    lifecycleState: "completed",
    assistantTurnId: turn.assistantTurnId,
    providerId: turn.policyDecision.providerId,
    modelId: turn.policyDecision.modelId,
    startedAt: turn.startedAt,
    now: ports.clock.now(),
    errorCode: status === "failed" ? "conversation_title_failed" : undefined,
    attributes: {
      stage: "conversation_title",
      status,
      reason: reason ?? null,
    },
  }).pipe(Effect.catch(() => Effect.void));

const titleGenerationFailure = (reason: TitleFailureReason): TitleGenerationFailure => ({
  reason,
});

const titleFailureReason = (error: unknown): TitleFailureReason =>
  isTitleGenerationFailure(error) ? error.reason : TITLE_FAILURE_REASONS.UNEXPECTED_FAILURE;

const isTitleGenerationFailure = (error: unknown): error is TitleGenerationFailure =>
  typeof error === "object" &&
  error !== null &&
  "reason" in error &&
  Object.values(TITLE_FAILURE_REASONS).includes(error.reason as TitleFailureReason);
