import type { ReactElement } from "react";

import { useSideChatWidgetController } from "./widget-controller.js";
import type { SideChatWidgetProps } from "./widget.types.js";
import { SideChatWidgetView } from "./widget-view.js";

export type {
  SideChatWidgetHostCommand,
  SideChatWidgetLabels,
  SideChatWidgetMessage,
  SideChatWidgetPanelActions,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  SideChatWidgetStateSnapshot,
  SideChatWidgetStatus,
} from "./widget.types.js";

export const SideChatWidget = ({
  client,
  hostBridge,
  initialState,
  labels = {},
  panelActions,
  quickActions = [],
  requestFactory,
}: SideChatWidgetProps): ReactElement => {
  const controller = useSideChatWidgetController({
    client,
    ...(hostBridge ? { hostBridge } : {}),
    ...(initialState ? { initialState } : {}),
    ...(panelActions ? { panelActions } : {}),
    ...(requestFactory ? { requestFactory } : {}),
  });

  return (
    <SideChatWidgetView
      controller={controller}
      labels={labels}
      quickActions={quickActions}
    />
  );
};
