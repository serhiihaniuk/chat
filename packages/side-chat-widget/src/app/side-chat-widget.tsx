import { useMemo, type ReactElement } from "react";

import { resolveWidgetClient } from "./create-widget-client.js";
import {
  useSideChatWidgetController,
  type UseSideChatWidgetControllerOptions,
} from "./widget-controller.js";
import type { SideChatWidgetProps } from "./widget.types.js";
import { SideChatWidgetView } from "./widget-view.js";
import type { ChatClient } from "@side-chat/chat-client";
import { defaultQuickActions } from "#features/quick-actions/model/quick-action";
import { omitUndefined } from "#shared/lib/omit-undefined";

export type {
  SideChatWidgetHostCommand,
  SideChatWidgetLabels,
  SideChatWidgetAssistantProfile,
  SideChatWidgetIdentity,
  SideChatWidgetMessage,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  SideChatWidgetStateSnapshot,
  SideChatWidgetStatus,
  SideChatWidgetTransport,
} from "./widget.types.js";

export const SideChatWidget = (props: SideChatWidgetProps): ReactElement => {
  const client = useMemo(() => resolveWidgetClient(props), [props]);
  const controllerOptions = useMemo(
    () => createControllerOptions(props, client),
    [client, props],
  );
  const controller = useSideChatWidgetController(controllerOptions);

  return (
    <SideChatWidgetView
      controller={controller}
      labels={props.labels ?? {}}
      quickActions={props.quickActions ?? defaultQuickActions}
    />
  );
};

const createControllerOptions = (
  props: SideChatWidgetProps,
  client: ChatClient,
): UseSideChatWidgetControllerOptions =>
  omitUndefined({
    assistantProfiles: props.assistantProfiles,
    client,
    defaultAssistantProfileId: props.defaultAssistantProfileId,
    defaultOpen: props.defaultOpen,
    defaultPanelSize: props.defaultPanelSize,
    hostBridge: props.hostBridge,
    identity: props.identity,
    initialConversationId: props.initialConversationId,
    initialState: props.initialState,
    onError: props.onError,
    onOpen: props.onOpen,
    onUsage: props.onUsage,
    panelActions: props.panelActions,
    requestFactory: props.requestFactory,
  }) as UseSideChatWidgetControllerOptions;
