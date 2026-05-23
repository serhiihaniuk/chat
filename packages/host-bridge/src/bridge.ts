import type { HostCommandEvent, HostContext } from "@side-chat/chat-protocol";

import { toHostCommand, type HostCapabilities } from "./capability.js";
import type { HostCommandResult } from "./command-result.js";
import {
  dispatchSupportedCommand,
  type HostCommandDispatcher,
} from "./command-dispatcher.js";
import {
  toProtocolHostContext,
  type HostContextProvider,
  type HostContextRequest,
} from "./host-context.js";

export type HostBridge = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContext>;
  readonly getCapabilities: () => Promise<HostCapabilities>;
  readonly dispatchCommand: (
    event: HostCommandEvent,
  ) => Promise<HostCommandResult>;
};

export type HostBridgeOptions = {
  readonly contextProvider: HostContextProvider;
  readonly dispatcher: HostCommandDispatcher;
  readonly capabilities: HostCapabilities;
};

export const createHostBridge = (options: HostBridgeOptions): HostBridge => ({
  getContext: async (request) =>
    toProtocolHostContext(await options.contextProvider.getContext(request)),
  getCapabilities: async () =>
    options.contextProvider.getCapabilities
      ? await options.contextProvider.getCapabilities()
      : options.capabilities,
  dispatchCommand: (event) =>
    dispatchSupportedCommand(
      options.dispatcher,
      options.capabilities,
      toHostCommand(event),
    ),
});
