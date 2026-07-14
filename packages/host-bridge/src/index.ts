export {
  isHostCommandActivityEvent,
  supportsCommand,
  supportsTool,
  toClientToolDefinitions,
  toHostCommand,
  type BrowserHostCommandCapability,
  type HostCapabilities,
  type HostCommand,
  type HostCommandActivityEvent,
  type HostClientToolDefinition,
  type HostToolCall,
} from "./commands/capability.js";
export {
  createCommandResult,
  createFailedResult,
  createRejectedResult,
  createUnsupportedResult,
  HOST_COMMAND_RESULT_STATUSES,
  type CommandResultInput,
  type HostCommandResult,
  type HostCommandResultStatus,
  createFailedToolResult,
  createToolResult,
  createUnsupportedToolResult,
  type HostToolResult,
} from "./commands/command-result.js";
export {
  dispatchSupportedCommand,
  dispatchSupportedToolCall,
  type HostCommandDispatcher,
  type HostToolDispatcher,
} from "./commands/command-dispatcher.js";
export {
  createHostBridge,
  type HostBridge,
  type HostBridgeOptions,
  type HostCapabilityProvider,
  type WidgetHostBridge,
} from "./bridge/bridge.js";
export {
  createStaticHostContextProvider,
  toProtocolHostContext,
  type HostContextProvider,
  type HostContextRequest,
  type HostContextSnapshot,
  type HostSurface,
} from "./context/host-context.js";
export {
  connectIframeHostContextProvider,
  registerIframeHostContextProvider,
  type ConnectIframeHostContextProviderOptions,
  type RegisterIframeHostContextProviderOptions,
} from "./context/iframe-host-context.js";
