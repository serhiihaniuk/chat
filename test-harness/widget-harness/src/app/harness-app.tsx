import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { SideChatWidget, type SideChatWidgetProps } from "@side-chat/side-chat-widget";

import { createHarnessHostBridge } from "#host/fake-host-bridge";
import { createLocalServiceClient } from "#clients/local-service-client";
import { createMockStreamClient } from "#clients/mock-stream-client";
import { parseWidgetHarnessConfig, type WidgetHarnessConfig } from "#config/modes";

const SERVICE_DEFAULT_ASSISTANT_PROFILE_ID = "default";

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
    assistantProfiles: [{ id: SERVICE_DEFAULT_ASSISTANT_PROFILE_ID, label: "Default assistant" }],
    client,
    conversationStorageKey: `side-chat-widget:${config.workspaceId}:conversations`,
    defaultAssistantProfileId: SERVICE_DEFAULT_ASSISTANT_PROFILE_ID,
    defaultOpen: true,
    defaultPanelSize: resolveHarnessPanelSize(),
    hostBridge,
    labels: {
      title: "Workspace Assistant",
      placeholder: "Ask about this page",
      send: "Send",
    },
    quickActions: [
      { id: "summarize", label: "Summarize this page", prompt: "Summarize this page." },
      {
        id: "explain",
        label: "Explain the context scope section",
        prompt: "Explain the context scope section.",
      },
      {
        id: "debounce",
        label: "Show me a debounce helper",
        prompt: "Show me a debounce helper.",
      },
      { id: "reply", label: "Draft a reply about this", prompt: "Draft a reply about this." },
    ],
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
  if (typeof window === "undefined") return { height: 1100, width: 1080 };
  // Stay a contained floating panel (viewport minus a gutter), wide enough to reveal
  // the conversation sidebar on a roomy host viewport.
  return {
    height: Math.max(620, window.innerHeight - 32),
    width: Math.min(Math.max(720, window.innerWidth - 32), 1080),
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
