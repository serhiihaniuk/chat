import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { SideChatWidget, type SideChatWidgetProps } from "@side-chat/side-chat-widget";

import { createHarnessHostBridge } from "#host/fake-host-bridge";
import { createLocalServiceClient } from "#clients/local-service-client";
import { createMockStreamClient } from "#clients/mock-stream-client";
import { parseWidgetHarnessConfig, type WidgetHarnessConfig } from "#config/modes";

export type WidgetHarnessApp = {
  readonly config: WidgetHarnessConfig;
  readonly element: ReactElement;
};

export const createWidgetHarnessApp = (config: WidgetHarnessConfig): WidgetHarnessApp => {
  const hostBridge = createHarnessHostBridge(config);
  const client =
    config.mode === "local-service"
      ? createLocalServiceClient(config)
      : createMockStreamClient(config);
  const props: SideChatWidgetProps = {
    assistantProfiles: [
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
      { id: "gpt-5.4", label: "GPT-5.4" },
    ],
    client,
    defaultAssistantProfileId: "gpt-5.4-mini",
    defaultOpen: true,
    defaultPanelSize: resolveHarnessPanelSize(),
    hostBridge,
    labels: {
      title: "Workspace Assistant",
      placeholder: "Ask about this page",
      send: "Send",
    },
  };

  return {
    config,
    element: createElement(SideChatWidget, props),
  };
};

const resolveHarnessPanelSize = (): {
  readonly height: number;
  readonly width: number;
} => {
  if (typeof window === "undefined") return { height: 1200, width: 1440 };
  return {
    height: Math.max(760, window.innerHeight - 24),
    width: Math.max(640, window.innerWidth - 64),
  };
};

export const mountWidgetHarness = (container: Element, search: string): void => {
  const app = createWidgetHarnessApp(parseWidgetHarnessConfig(search));
  createRoot(container).render(app.element);
};

export const mountBrowserHarness = (): void => {
  const container = document.querySelector("#root");
  if (!container) return;
  mountWidgetHarness(container, window.location.search);
};
