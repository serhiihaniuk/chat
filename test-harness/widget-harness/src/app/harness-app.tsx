import { createElement, useEffect, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { SideChatWidget, type SideChatWidgetProps } from "@side-chat/side-chat-widget";

import { createHarnessHostBridge } from "#host/fake-host-bridge";
import { createLocalServiceClient } from "#clients/local-service-client";
import { createMockStreamClient } from "#clients/mock-stream-client";
import {
  parseWidgetHarnessConfig,
  WIDGET_HARNESS_OPEN_CONTROLS,
  type WidgetHarnessConfig,
} from "#config/modes";

const SERVICE_DEFAULT_ASSISTANT_PROFILE_ID = "default";
const SET_OPEN_MESSAGE_TYPE = "sidechat.widget.setOpen";
const OPEN_CHANGE_MESSAGE_TYPE = "sidechat.widget.openChange";

/**
 * Host-to-frame command for the local iframe harness.
 *
 * A Workbench page sends this message to the iframe window after its own button
 * changes desired panel state. The iframe only receives the boolean decision;
 * host auth, routing, and button UI remain outside the frame.
 */
export type WidgetHarnessSetOpenMessage = {
  readonly type: typeof SET_OPEN_MESSAGE_TYPE;
  readonly open: boolean;
};

/**
 * Frame-to-host request emitted when Side Chat chrome asks to close or open.
 *
 * The parent page decides whether to accept the request and, if accepted, sends
 * `WidgetHarnessSetOpenMessage` back. This keeps the host app as the visible
 * source of truth for iframe open state.
 */
export type WidgetHarnessOpenChangeMessage = {
  readonly type: typeof OPEN_CHANGE_MESSAGE_TYPE;
  readonly open: boolean;
};

export type WidgetHarnessApp = {
  readonly config: WidgetHarnessConfig;
  readonly element: ReactElement;
};

export const createWidgetHarnessApp = (config: WidgetHarnessConfig): WidgetHarnessApp => {
  return {
    config,
    element: createElement(WidgetHarnessFrame, { config }),
  };
};

const WidgetHarnessFrame = ({ config }: { readonly config: WidgetHarnessConfig }) => {
  const [hostOpen, setHostOpen] = useState(config.defaultOpen);
  const hostControlled = config.openControl === WIDGET_HARNESS_OPEN_CONTROLS.HOST;

  useEffect(() => {
    if (!hostControlled) return undefined;

    const receiveHostControl = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (isSetOpenMessage(message)) setHostOpen(message.open);
    };

    window.addEventListener("message", receiveHostControl);
    return () => window.removeEventListener("message", receiveHostControl);
  }, [hostControlled]);

  const props = createWidgetHarnessProps(config);
  if (!hostControlled) return createElement(SideChatWidget, props);

  return createElement(SideChatWidget, {
    ...props,
    onOpenChange: (open: boolean) => {
      window.parent.postMessage({ type: OPEN_CHANGE_MESSAGE_TYPE, open }, window.location.origin);
    },
    open: hostOpen,
    renderClosedLauncher: false,
  });
};

const isSetOpenMessage = (message: unknown): message is WidgetHarnessSetOpenMessage => {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as { readonly open?: unknown; readonly type?: unknown };
  return candidate.type === SET_OPEN_MESSAGE_TYPE && typeof candidate.open === "boolean";
};

const createWidgetHarnessProps = (config: WidgetHarnessConfig): SideChatWidgetProps => {
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
    defaultOpen: config.defaultOpen,
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
  return props;
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
