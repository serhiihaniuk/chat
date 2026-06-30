import type { Effect } from "effect";
import type { JSONSchema7 } from "@ai-sdk/provider";
import type { JsonObject } from "@side-chat/shared";
import type {
  AiRuntimeError,
  AiToolScope,
  AssistantTurnId,
  ModelId,
  ProviderId,
  RequestId,
  RuntimeActivitySource,
  ToolCallId,
} from "@side-chat/ai-runtime-contract";

export type RuntimeToolScope = AiToolScope;

/**
 * Runtime tools are capabilities injected by the consuming app.
 *
 * The runtime knows how to expose and execute this protocol, but it does not
 * know the concrete finance, PDF, CRM, host-command, or test services behind it.
 */
export type RuntimeToolContext = {
  readonly requestId: RequestId;
  readonly assistantTurnId: AssistantTurnId;
  readonly scope?: RuntimeToolScope | undefined;
  readonly providerId?: ProviderId | undefined;
  readonly modelId: ModelId;
  readonly toolName: string;
  readonly toolCallId?: ToolCallId | undefined;
  readonly abortSignal?: AbortSignal | undefined;
};

export type RuntimeToolError = AiRuntimeError;
export type RuntimeToolRequirements = never;
export type RuntimeToolEffect = Effect.Effect<
  JsonObject,
  RuntimeToolError,
  RuntimeToolRequirements
>;

/**
 * Executable backend capability exposed to the selected agent executor.
 *
 * This is the implementation side of a tool. A manifest ToolCapability may
 * describe the same name, but runtime executes only registered tools selected
 * by the per-turn AiRuntimeRequest tool-name allowlist.
 */
export type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  readonly timeoutMs?: number | undefined;
  readSources?: ((result: JsonObject) => readonly RuntimeActivitySource[]) | undefined;
  execute(input: JsonObject, context: RuntimeToolContext): RuntimeToolEffect;
};

/**
 * One UI (host) tool call awaiting its browser-side result.
 *
 * `commandId` is the tool-call id, so a result can be correlated back to this
 * exact call. The payload is the model's arguments.
 */
export type HostCommandResolveRequest = {
  readonly assistantTurnId: string;
  readonly commandId: string;
  readonly commandName: string;
  readonly payload: JsonObject;
  readonly abortSignal?: AbortSignal | undefined;
};

/**
 * Resolves a UI (host) tool call by awaiting the browser's result.
 *
 * A host command runs in the browser, so the runtime cannot execute it directly.
 * The service implements this port: it correlates the dispatched command by id,
 * waits for the browser to return a result, and resolves it back here. The model
 * then receives the returned data and continues, exactly like a backend tool.
 * The implementation owns the timeout so the tool loop never hangs forever.
 */
export type HostCommandResolver = {
  readonly awaitResult: (request: HostCommandResolveRequest) => Promise<JsonObject>;
};
