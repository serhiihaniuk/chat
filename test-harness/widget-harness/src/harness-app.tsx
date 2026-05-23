import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import {
  SideChatWidget,
  type SideChatWidgetProps,
} from "../../../packages/side-chat-widget/src/index.js";

import { createHarnessHostBridge } from "./fake-host-bridge.js";
import { createLocalServiceClient } from "./local-service-client.js";
import { createMockStreamClient } from "./mock-stream-client.js";
import {
  modeLabel,
  parseWidgetHarnessConfig,
  type WidgetHarnessConfig,
} from "./modes.js";

export type WidgetHarnessApp = {
  readonly config: WidgetHarnessConfig;
  readonly element: ReactElement;
};

export const createWidgetHarnessApp = (
  config: WidgetHarnessConfig,
): WidgetHarnessApp => {
  const hostBridge = createHarnessHostBridge(config);
  const client =
    config.mode === "local-service"
      ? createLocalServiceClient(config)
      : createMockStreamClient();
  const props: SideChatWidgetProps = {
    client,
    hostBridge,
    labels: { title: `${modeLabel(config.mode)} harness` },
  };

  return {
    config,
    element: createElement(SideChatWidget, props),
  };
};

export const mountWidgetHarness = (
  container: Element,
  search: string,
): void => {
  const app = createWidgetHarnessApp(parseWidgetHarnessConfig(search));
  createRoot(container).render(app.element);
};

export const mountBrowserHarness = (): void => {
  const container = document.querySelector("#root");
  if (!container) return;
  mountWidgetHarness(container, window.location.search);
};
