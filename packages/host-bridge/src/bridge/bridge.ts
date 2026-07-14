import type { HostContext } from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";

import {
  toHostCommand,
  type HostCapabilities,
  type HostCommandActivityEvent,
  type HostToolCall,
} from "#commands/capability";
import {
  createFailedToolResult,
  createToolResult,
  type HostCommandResult,
  type HostToolResult,
} from "#commands/command-result";
import {
  dispatchSupportedCommand,
  dispatchSupportedToolCall,
  type HostCommandDispatcher,
  type HostToolDispatcher,
} from "#commands/command-dispatcher";
import {
  toProtocolHostContext,
  type HostContextProvider,
  type HostContextRequest,
} from "#context/host-context";

/** Complete method vocabulary for the browser seam between Side Chat and its host. */
export type HostBridge = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContext>;
  readonly getCapabilities: () => Promise<HostCapabilities>;
  readonly dispatchCommand: (event: HostCommandActivityEvent) => Promise<HostCommandResult>;
  readonly dispatchToolCall: (toolCall: HostToolCall) => Promise<HostToolResult>;
};

/**
 * The optional bridge view consumed by the widget.
 *
 * Page context, command catalogs, legacy commands, and native client tools are
 * independent. A host exposes only the methods it actually implements.
 */
export type WidgetHostBridge = Partial<HostBridge>;

/** Dynamic command capability source, independent from page-context collection. */
export type HostCapabilityProvider = {
  readonly getCapabilities: () => Promise<HostCapabilities>;
};

/** Concrete direct-host integrations bound into a widget bridge. */
export type HostBridgeOptions = {
  readonly contextProvider?: HostContextProvider | undefined;
  readonly capabilityProvider?: HostCapabilityProvider | undefined;
  readonly dispatcher?: HostCommandDispatcher | undefined;
  readonly capabilities?: HostCapabilities | undefined;
  readonly toolDispatcher?: HostToolDispatcher | undefined;
};

/** Bind only the context and command methods backed by the supplied host options. */
export const createHostBridge = (options: HostBridgeOptions): WidgetHostBridge => {
  const resolveCapabilities = createCapabilityResolver(options);
  const contextProvider = options.contextProvider;
  const dispatcher = options.dispatcher;
  const toolDispatcher = options.toolDispatcher;

  const getContext = contextProvider
    ? async (request: HostContextRequest) =>
        toProtocolHostContext(await contextProvider.getContext(request))
    : undefined;
  const dispatchCommand =
    dispatcher && resolveCapabilities
      ? async (event: HostCommandActivityEvent) =>
          dispatchSupportedCommand(dispatcher, await resolveCapabilities(), toHostCommand(event))
      : undefined;
  const dispatchToolCall =
    resolveCapabilities && (toolDispatcher || dispatcher)
      ? async (toolCall: HostToolCall) =>
          dispatchBridgeToolCall(toolCall, await resolveCapabilities(), dispatcher, toolDispatcher)
      : undefined;

  return omitUndefinedProperties({
    getContext,
    getCapabilities: resolveCapabilities,
    dispatchCommand,
    dispatchToolCall,
  });
};

function createCapabilityResolver(
  options: HostBridgeOptions,
): (() => Promise<HostCapabilities>) | undefined {
  const capabilityProvider = options.capabilityProvider;
  if (capabilityProvider) return () => capabilityProvider.getCapabilities();
  const capabilities = options.capabilities;
  return capabilities ? () => Promise.resolve(capabilities) : undefined;
}

async function dispatchBridgeToolCall(
  toolCall: HostToolCall,
  capabilities: HostCapabilities,
  dispatcher: HostCommandDispatcher | undefined,
  toolDispatcher: HostToolDispatcher | undefined,
): Promise<HostToolResult> {
  if (toolDispatcher) return dispatchSupportedToolCall(toolDispatcher, capabilities, toolCall);
  if (!dispatcher) return createFailedToolResult(toolCall);

  try {
    const commandResult = await dispatchSupportedCommand(dispatcher, capabilities, {
      assistantTurnId: "workflow-client-tool",
      commandId: toolCall.toolCallId,
      commandName: toolCall.toolName,
      payload: toolCall.input,
    });
    return createToolResult(toolCall, commandResult);
  } catch {
    return createFailedToolResult(toolCall);
  }
}
