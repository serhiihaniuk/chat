import { omitUndefinedProperties } from "@side-chat/shared";

import {
  type HostCapabilities,
  type HostToolCall,
} from "#tools/tool-capability";
import type { HostToolResult } from "#tools/tool-result";
import {
  dispatchSupportedToolCall,
  type HostToolDispatcher,
} from "#tools/tool-dispatcher";
import {
  toHostContext,
  type HostContext,
  type HostContextProvider,
  type HostContextRequest,
} from "#context/host-context";

export type HostBridge = Readonly<{
  getContext: (request: HostContextRequest) => Promise<HostContext>;
  getCapabilities: () => Promise<HostCapabilities>;
  dispatchToolCall: (toolCall: HostToolCall) => Promise<HostToolResult>;
}>;

export type WidgetHostBridge = Partial<HostBridge>;

export type HostCapabilityProvider = Readonly<{
  getCapabilities: () => Promise<HostCapabilities>;
}>;

export type HostBridgeOptions = Readonly<{
  contextProvider?: HostContextProvider | undefined;
  capabilityProvider?: HostCapabilityProvider | undefined;
  capabilities?: HostCapabilities | undefined;
  toolDispatcher?: HostToolDispatcher | undefined;
}>;

/** Bind the browser-safe page context and native client-tool methods supplied by the host. */
export function createHostBridge(options: HostBridgeOptions): WidgetHostBridge {
  const resolveCapabilities = createCapabilityResolver(options);
  const contextProvider = options.contextProvider;
  const toolDispatcher = options.toolDispatcher;

  const getContext = contextProvider
    ? async (request: HostContextRequest) => toHostContext(await contextProvider.getContext(request))
    : undefined;
  const dispatchToolCall =
    resolveCapabilities && toolDispatcher
      ? async (toolCall: HostToolCall) =>
          dispatchSupportedToolCall(toolDispatcher, await resolveCapabilities(), toolCall)
      : undefined;

  return omitUndefinedProperties({
    getContext,
    getCapabilities: resolveCapabilities,
    dispatchToolCall,
  });
}

function createCapabilityResolver(
  options: HostBridgeOptions,
): (() => Promise<HostCapabilities>) | undefined {
  const capabilityProvider = options.capabilityProvider;
  if (capabilityProvider) return () => capabilityProvider.getCapabilities();
  const capabilities = options.capabilities;
  return capabilities ? () => Promise.resolve(capabilities) : undefined;
}
