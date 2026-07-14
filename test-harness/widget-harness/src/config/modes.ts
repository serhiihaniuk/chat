export type WidgetHarnessMode = "mock-stream" | "local-service" | "workflow-service";
export const WIDGET_HARNESS_OPEN_CONTROLS = {
  HOST: "host",
  WIDGET: "widget",
} as const;
export type WidgetHarnessOpenControl =
  (typeof WIDGET_HARNESS_OPEN_CONTROLS)[keyof typeof WIDGET_HARNESS_OPEN_CONTROLS];
export type WidgetHarnessScenario =
  | "default"
  | "echo-request"
  | "error"
  | "blocked"
  | "failed-host-command"
  | "tool";

export type WidgetHarnessConfig = {
  readonly mode: WidgetHarnessMode;
  readonly apiBaseUrl: string;
  readonly authToken: string;
  readonly defaultOpen: boolean;
  readonly openControl: WidgetHarnessOpenControl;
  readonly scenario: WidgetHarnessScenario;
  readonly workspaceId: string;
};

const DEFAULT_API_BASE_URL = "/side-chat-api";
const DEFAULT_AUTH_TOKEN = "local-compose-token";
const DEFAULT_WORKSPACE_ID = "workspace_local";

export const parseWidgetHarnessConfig = (search: string): WidgetHarnessConfig => {
  const params = new URLSearchParams(search);
  const mode = parseMode(params.get("mode"));
  return {
    mode,
    apiBaseUrl: params.get("apiBaseUrl") ?? DEFAULT_API_BASE_URL,
    authToken: params.get("authToken") ?? DEFAULT_AUTH_TOKEN,
    defaultOpen: parseDefaultOpen(params.get("open"), params.get("defaultOpen")),
    openControl: parseOpenControl(params.get("openControl")),
    scenario: parseScenario(params.get("scenario")),
    workspaceId: params.get("workspaceId") ?? DEFAULT_WORKSPACE_ID,
  };
};

export const modeLabel = (mode: WidgetHarnessMode): string => {
  switch (mode) {
    case "mock-stream":
      return "Mock stream";
    case "local-service":
      return "Local service";
    case "workflow-service":
      return "Workflow service";
  }
};

const parseMode = (mode: string | null): WidgetHarnessMode => {
  if (mode === "mock-stream") return "mock-stream";
  if (mode === "local-service") return "local-service";
  if (mode === "workflow-service") return "workflow-service";
  return "local-service";
};

const parseDefaultOpen = (open: string | null, defaultOpen: string | null): boolean =>
  (open ?? defaultOpen) !== "false";

const parseOpenControl = (control: string | null): WidgetHarnessOpenControl => {
  if (control === WIDGET_HARNESS_OPEN_CONTROLS.HOST) return WIDGET_HARNESS_OPEN_CONTROLS.HOST;
  return WIDGET_HARNESS_OPEN_CONTROLS.WIDGET;
};

const parseScenario = (scenario: string | null): WidgetHarnessScenario => {
  if (scenario === "echo-request") return "echo-request";
  if (scenario === "error") return "error";
  if (scenario === "blocked") return "blocked";
  if (scenario === "failed-host-command") return "failed-host-command";
  if (scenario === "tool") return "tool";
  return "default";
};
