import type { Effect } from "effect";
import type { JSONSchema7 } from "@ai-sdk/provider";
import type { JsonObject } from "@side-chat/shared";

import type { AgentRuntimeError } from "#runtime/contract/runtime-error";
import type { RuntimeActivitySource } from "#runtime/contract/runtime-activity";

export type RuntimeToolScope = {
  readonly hostAppId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly profileId: string;
  readonly allowedHostCommandNames?: readonly string[];
};

/**
 * Runtime tools are capabilities injected by the consuming app.
 *
 * The runtime knows how to expose and execute this protocol, but it does not
 * know the concrete finance, PDF, CRM, host-command, or test services behind it.
 */
export type RuntimeToolContext = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly scope?: RuntimeToolScope;
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

/**
 * Executable backend capability exposed to the selected agent executor.
 *
 * This is the implementation side of a tool. A manifest ToolCapability may
 * describe the same name, but runtime executes only registered tools selected
 * by the per-turn AgentRuntimeRequest allowlist.
 */
export type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  readonly timeoutMs?: number;
  readSources?: (result: JsonObject) => readonly RuntimeActivitySource[];
  execute(input: JsonObject, context: RuntimeToolContext): RuntimeToolEffect;
};
