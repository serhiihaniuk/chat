import type { HostContext } from "@side-chat/chat-protocol";

import {
  toHostCommand,
  type HostCapabilities,
  type HostCommandActivityEvent,
} from "#commands/capability";
import type { HostCommandResult } from "#commands/command-result";
import { dispatchSupportedCommand, type HostCommandDispatcher } from "#commands/command-dispatcher";
import {
  toProtocolHostContext,
  type HostContextProvider,
  type HostContextRequest,
} from "#context/host-context";

export type HostBridge = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContext>;
  readonly getCapabilities: () => Promise<HostCapabilities>;
  readonly dispatchCommand: (event: HostCommandActivityEvent) => Promise<HostCommandResult>;
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
    dispatchSupportedCommand(options.dispatcher, options.capabilities, toHostCommand(event)),
});
