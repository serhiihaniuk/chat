import { type ProviderOptions, WorkflowAgent, type WorkflowAgentOptions } from "@ai-sdk/workflow";
import { isStepCount, type ModelMessage, type ToolSet } from "ai";

import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import type { SerializableChatMessage } from "../input/chat-turn-input.js";

interface CreateChatTurnAgentOptions {
  readonly id: string;
  readonly model: WorkflowAgentOptions["model"];
  readonly instructions: string;
  readonly maxSteps: number;
  readonly maxRetries: number;
  readonly providerOptions: ProviderOptions | undefined;
  readonly clientTools: ToolSet;
  readonly serverTools: ToolSet;
}

export const CHAT_TURN_AGENT_ERROR_CODES = {
  TOOL_CONFLICT: "tool_conflict",
} as const;

/** A client tool and server tool claimed the same model-visible name. */
export class ChatTurnToolConflictError extends Error {
  readonly code = CHAT_TURN_AGENT_ERROR_CODES.TOOL_CONFLICT;
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Duplicate client/server tool name: ${toolName}`);
    this.name = "ChatTurnToolConflictError";
    this.toolName = toolName;
  }
}

/** Construct the disposable native agent for one durable turn execution. */
export function createChatTurnAgent(options: CreateChatTurnAgentOptions): WorkflowAgent {
  const agentOptions: WorkflowAgentOptions = {
    id: options.id,
    model: options.model,
    instructions: options.instructions,
    stopWhen: isStepCount(options.maxSteps),
    maxRetries: options.maxRetries,
    telemetry: PRIVATE_TELEMETRY_OPTIONS,
    tools: mergeChatTurnTools(options.clientTools, options.serverTools),
  };
  if (options.providerOptions !== undefined) {
    agentOptions.providerOptions = options.providerOptions;
  }
  return new WorkflowAgent(agentOptions);
}

export function toChatTurnModelMessages(
  messages: readonly SerializableChatMessage[],
): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function mergeChatTurnTools(clientTools: ToolSet, serverTools: ToolSet): ToolSet {
  const duplicate = Object.keys(clientTools).find((name) => name in serverTools);
  if (duplicate !== undefined) {
    throw new ChatTurnToolConflictError(duplicate);
  }
  return { ...clientTools, ...serverTools };
}
