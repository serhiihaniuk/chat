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

/**
 * The narrowed bridge view a widget consumes.
 *
 * `getContext` and `dispatchCommand` are required. `getCapabilities` is optional:
 * a host implements it only when it declares host commands for the model to call,
 * and it is read once per turn so the available command set can vary by page.
 */
export type WidgetHostBridge = Pick<HostBridge, "getContext" | "dispatchCommand"> &
  Partial<Pick<HostBridge, "getCapabilities">>;

export type HostBridgeOptions = {
  readonly contextProvider: HostContextProvider;
  readonly dispatcher: HostCommandDispatcher;
  readonly capabilities: HostCapabilities;
};

export const createHostBridge = (options: HostBridgeOptions): HostBridge => {
  // Advertising and gating must read the SAME capability source: if dispatch
  // gated against the static `options.capabilities` while `getCapabilities`
  // served a provider's per-page set, a command advertised to the model could be
  // rejected as unsupported at dispatch. A provider read that throws fails the
  // dispatch honestly — the widget folds it into a failed command result.
  const resolveCapabilities = async (): Promise<HostCapabilities> =>
    options.contextProvider.getCapabilities
      ? await options.contextProvider.getCapabilities()
      : options.capabilities;

  return {
    getContext: async (request) =>
      toProtocolHostContext(await options.contextProvider.getContext(request)),
    getCapabilities: resolveCapabilities,
    dispatchCommand: async (event) =>
      dispatchSupportedCommand(
        options.dispatcher,
        await resolveCapabilities(),
        toHostCommand(event),
      ),
  };
};
