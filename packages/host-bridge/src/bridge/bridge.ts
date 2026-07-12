import type { HostContext } from "@side-chat/chat-protocol";

import {
  toHostCommand,
  type HostToolCall,
  type HostCapabilities,
  type HostCommandActivityEvent,
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

/**
 * Browser seam between Side Chat and the page that embeds it.
 *
 * Context enters the turn through `getContext`; model-requested host commands
 * leave through `dispatchCommand`. Capabilities and dispatch share one source so
 * the widget never advertises a command that the same bridge would reject merely
 * because two catalogs drifted apart.
 */
export type HostBridge = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContext>;
  readonly getCapabilities: () => Promise<HostCapabilities>;
  readonly dispatchCommand: (
    event: HostCommandActivityEvent,
  ) => Promise<HostCommandResult>;
  readonly dispatchToolCall: (
    toolCall: HostToolCall,
  ) => Promise<HostToolResult>;
};

/**
 * The narrowed bridge view a widget consumes.
 *
 * `getContext` and `dispatchCommand` are required. `getCapabilities` is optional:
 * a host implements it only when it declares host commands for the model to call,
 * and it is read once per turn so the available command set can vary by page.
 */
export type WidgetHostBridge = Pick<
  HostBridge,
  "getContext" | "dispatchCommand"
> &
  Partial<Pick<HostBridge, "getCapabilities" | "dispatchToolCall">>;

/** Concrete host implementations bound into a {@link HostBridge}. */
export type HostBridgeOptions = {
  readonly contextProvider: HostContextProvider;
  readonly dispatcher: HostCommandDispatcher;
  readonly capabilities: HostCapabilities;
  readonly toolDispatcher?: HostToolDispatcher | undefined;
};

/**
 * Bind host context, command capabilities, and dispatch into one widget bridge.
 *
 * The bridge converts the richer host snapshot to browser-safe protocol context
 * on every request. Dispatcher exceptions become failed command results; context
 * or capability-provider failures remain rejected promises for the widget to
 * surface as host integration failures.
 */
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
    dispatchToolCall: async (toolCall) => {
      const capabilities = await resolveCapabilities();
      if (options.toolDispatcher) {
        return dispatchSupportedToolCall(
          options.toolDispatcher,
          capabilities,
          toolCall,
        );
      }

      try {
        const commandResult = await dispatchSupportedCommand(
          options.dispatcher,
          capabilities,
          {
            assistantTurnId: "workflow-client-tool",
            commandId: toolCall.toolCallId,
            commandName: toolCall.toolName,
            payload: toolCall.input,
          },
        );
        return createToolResult(toolCall, commandResult);
      } catch {
        return createFailedToolResult(toolCall);
      }
    },
  };
};
