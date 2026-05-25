import type { Effect } from "effect";
import type { ActivitySource, JsonObject } from "@side-chat/chat-protocol";
import type { JSONSchema7 } from "@ai-sdk/provider";

import type { AgentRuntimeError } from "#runtime/runtime-error";

/**
 * Runtime tools are capabilities injected by the consuming app.
 *
 * The runtime knows how to expose and execute this protocol, but it does not
 * know the concrete finance, PDF, CRM, host-command, or test services behind it.
 */
export type RuntimeToolContext = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId?: string;
  readonly modelId: string;
  readonly toolName: string;
  readonly toolCallId?: string;
  readonly abortSignal?: AbortSignal;
};

export type RuntimeToolError = AgentRuntimeError;
export type RuntimeToolRequirements = never;
export type RuntimeToolEffect = Effect.Effect<
  JsonObject,
  RuntimeToolError,
  RuntimeToolRequirements
>;

export type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  readonly timeoutMs?: number;
  readSources?: (result: JsonObject) => readonly ActivitySource[];
  execute(input: JsonObject, context: RuntimeToolContext): RuntimeToolEffect;
};
