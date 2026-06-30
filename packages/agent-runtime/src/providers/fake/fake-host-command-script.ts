import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { JsonObject } from "@side-chat/shared";

import type { ScriptedToolCall } from "#testing/scripted-language-model";

const OPEN_RESOURCE_COMMAND = "open_resource";

/**
 * Deterministic host-command tool call for the fake provider.
 *
 * When the user asks to open a host record and `open_resource` is exposed this
 * turn, the fake model calls it once. This exercises the model-driven host
 * command path end to end (the runtime emits a `host_command` activity the
 * browser dispatches) without a real provider. It returns undefined once the
 * command's synthetic result is in the prompt, so the tool loop does not repeat.
 */
export const createDemoHostCommandCall = (
  options: LanguageModelV3CallOptions,
  userText: string,
): ScriptedToolCall | undefined => {
  if (!shouldOpenHostResource(userText)) return undefined;
  if (hostCommandAlreadyDispatched(options)) return undefined;
  if (!isHostCommandExposed(options)) return undefined;
  return {
    toolCallId: `fake_open_resource_${options.prompt.length}`,
    toolName: OPEN_RESOURCE_COMMAND,
    title: "Open host record",
    input: demoResourceTarget(userText),
  };
};

const shouldOpenHostResource = (userText: string): boolean =>
  /\b(open|show|pull up|jump to)\b/iu.test(userText);

const isHostCommandExposed = (options: LanguageModelV3CallOptions): boolean =>
  options.tools?.some((tool) => tool.type === "function" && tool.name === OPEN_RESOURCE_COMMAND) ??
  false;

const hostCommandAlreadyDispatched = (options: LanguageModelV3CallOptions): boolean =>
  options.prompt.some(
    (message) =>
      message.role === "tool" &&
      message.content.some(
        (part) => part.type === "tool-result" && part.toolName === OPEN_RESOURCE_COMMAND,
      ),
  );

const demoResourceTarget = (userText: string): JsonObject => {
  if (/ticket/iu.test(userText)) return { resourceType: "ticket", resourceId: "ticket-4821" };
  if (/invoice/iu.test(userText)) return { resourceType: "invoice", resourceId: "invoice-1042" };
  return { resourceType: "customer", resourceId: "customer-acme" };
};
