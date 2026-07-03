import type {
  AiRuntimeMessage,
  AiRuntimeRequest,
  AiToolScope,
  RuntimeCallSettings,
} from "@side-chat/ai-runtime-contract";
import type { RuntimeTool } from "#tools/runtime-tool";

/**
 * Runtime-private request passed from runtime preparation into executors.
 *
 * The neutral `AiRuntimeRequest` contains only tool names. After runtime
 * validates those names against app-owned executable registrations, executors
 * receive RuntimeTool objects that must stay inside `agent-runtime`.
 */
export type RuntimeProviderRequest = {
  readonly requestId: AiRuntimeRequest["requestId"];
  readonly assistantTurnId: AiRuntimeRequest["assistantTurnId"];
  readonly providerId: AiRuntimeRequest["providerId"];
  readonly modelId: AiRuntimeRequest["modelId"];
  readonly callSettings?: RuntimeCallSettings | undefined;
  readonly messages: readonly AiRuntimeMessage[];
  readonly tools?: readonly RuntimeTool[] | undefined;
  readonly toolScope: AiToolScope;
  readonly abortSignal?: AbortSignal | undefined;
};
