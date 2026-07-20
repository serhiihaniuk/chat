import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import type { AuthContext } from "@side-chat/side-chat-server";

export type ConversationTitleWorkflowInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  modelId: string;
  timeoutMs: number;
  userContent: string;
  assistantContent: string;
  persistInWorkflow: boolean;
}>;

export type ConversationTitleWorkflowResult = Readonly<{
  title?: string;
  persisted: boolean;
}>;

export type StartedConversationTitleWorkflow = Readonly<{
  runId: string;
  result: Promise<ConversationTitleWorkflowResult>;
}>;

export interface ConversationTitleWorkflowStarter {
  start(input: ConversationTitleWorkflowInput): Promise<StartedConversationTitleWorkflow>;
}

export type StartConversationTitleInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  userContent: string;
  assistantContent: string;
  modelId: string;
  timeoutMs: number;
}>;

export type ConversationTitleDependencies = Readonly<{
  titles: ConversationTitleStore;
  workflow: ConversationTitleWorkflowStarter;
  telemetry: TelemetrySink;
  persistInWorkflow?: boolean;
}>;

/**
 * Start best-effort title enrichment after the completed turn has been persisted.
 *
 * The returned promise covers eligibility and durable workflow submission only.
 * Model completion and the conditional write continue independently, so title
 * latency or failure can never change the already committed turn outcome.
 */
export async function startConversationTitleGeneration(
  dependencies: ConversationTitleDependencies,
  input: StartConversationTitleInput,
): Promise<void> {
  if (!input.userContent.trim() || !input.assistantContent.trim()) {
    await recordSafely(dependencies.telemetry, {
      type: "conversation.title_skipped",
    });
    return;
  }

  try {
    const eligibility = await dependencies.titles.readTitleEligibility(
      input.auth,
      input.conversationId,
    );
    if (!eligibility.eligible) {
      await recordSafely(dependencies.telemetry, {
        type: "conversation.title_skipped",
      });
      return;
    }

    const started = await dependencies.workflow.start({
      auth: input.auth,
      conversationId: input.conversationId,
      requestId: `${input.requestId}:conversation-title`,
      modelId: input.modelId,
      timeoutMs: input.timeoutMs,
      userContent: input.userContent.trim(),
      assistantContent: input.assistantContent.trim(),
      persistInWorkflow: dependencies.persistInWorkflow === true,
    });
    void persistGeneratedTitle(dependencies, input, started.result);
  } catch {
    await recordSafely(dependencies.telemetry, {
      type: "conversation.title_error",
    });
  }
}

async function persistGeneratedTitle(
  dependencies: ConversationTitleDependencies,
  input: StartConversationTitleInput,
  result: Promise<ConversationTitleWorkflowResult>,
): Promise<void> {
  try {
    const generated = await result;
    const titleText = generated.title;
    if (titleText === undefined) {
      await recordSafely(dependencies.telemetry, {
        type: "conversation.title_skipped",
      });
      return;
    }
    if (!generated.persisted) {
      await dependencies.titles.prepareConversationTitle(
        input.auth,
        input.conversationId,
        titleText,
      );
    }
    await recordSafely(dependencies.telemetry, {
      type: "conversation.title_generated",
    });
  } catch {
    await recordSafely(dependencies.telemetry, {
      type: "conversation.title_error",
    });
  }
}

const TITLE_MAX_WORDS = 6;
const TITLE_MIN_WORDS = 2;
const TITLE_MAX_LENGTH = 64;

export function normalizeConversationTitle(
  rawTitle: string,
  userContent: string,
): string | undefined {
  const cleaned =
    rawTitle
      .split(/\r?\n/u)[0]
      ?.replace(/^\s*(?:title\s*:\s*)/iu, "")
      .replace(/^\s*[-*]\s*/u, "")
      .replace(/^["'`]+|["'`]+$/gu, "")
      .replace(/\s+/gu, " ")
      .trim() ?? "";
  const wordLimited = cleaned.split(/\s+/u).filter(Boolean).slice(0, TITLE_MAX_WORDS).join(" ");
  const lengthLimited = limitTitleLength(wordLimited);
  const title = stripTrailingPunctuation(lengthLimited).trim();
  if (wordCount(title) < TITLE_MIN_WORDS) return undefined;
  if (comparisonText(title) === comparisonText(userContent)) return undefined;
  return title;
}

function limitTitleLength(title: string): string {
  if (title.length <= TITLE_MAX_LENGTH) return title;
  const truncated = title.slice(0, TITLE_MAX_LENGTH).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

const stripTrailingPunctuation = (title: string): string => title.replace(/[.!?,:;]+$/u, "");
const wordCount = (title: string): number => title.split(/\s+/u).filter(Boolean).length;
const comparisonText = (text: string): string =>
  stripTrailingPunctuation(text).replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");

async function recordSafely(
  telemetry: TelemetrySink,
  record: Parameters<TelemetrySink["record"]>[0],
): Promise<void> {
  try {
    await telemetry.record(record);
  } catch {
    // Enrichment telemetry is fail-open for the same reason as title generation.
  }
}
