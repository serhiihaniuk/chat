export type WidgetHarnessMode = "service";
export const WIDGET_HARNESS_OPEN_CONTROLS = {
  HOST: "host",
  WIDGET: "widget",
} as const;
export type WidgetHarnessOpenControl =
  (typeof WIDGET_HARNESS_OPEN_CONTROLS)[keyof typeof WIDGET_HARNESS_OPEN_CONTROLS];
export type WidgetHarnessScenario = "default" | "failed-host-tool";

export type WidgetHarnessConfig = {
  readonly mode: WidgetHarnessMode;
  readonly apiBaseUrl: string;
  readonly authToken: string;
  readonly defaultOpen: boolean;
  readonly clientToolsEnabled: boolean;
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
    clientToolsEnabled: params.get("clientTools") !== "false",
    defaultOpen: parseDefaultOpen(params.get("open"), params.get("defaultOpen")),
    openControl: parseOpenControl(params.get("openControl")),
    scenario: parseScenario(params.get("scenario")),
    workspaceId: params.get("workspaceId") ?? DEFAULT_WORKSPACE_ID,
  };
};

export const modeLabel = (_mode: WidgetHarnessMode): string => "Service";

const parseMode = (_mode: string | null): WidgetHarnessMode => "service";

const parseDefaultOpen = (open: string | null, defaultOpen: string | null): boolean =>
  (open ?? defaultOpen) !== "false";

const parseOpenControl = (control: string | null): WidgetHarnessOpenControl => {
  if (control === WIDGET_HARNESS_OPEN_CONTROLS.HOST) return WIDGET_HARNESS_OPEN_CONTROLS.HOST;
  return WIDGET_HARNESS_OPEN_CONTROLS.WIDGET;
};

const parseScenario = (scenario: string | null): WidgetHarnessScenario => {
  if (scenario === "failed-host-tool") return "failed-host-tool";
  return "default";
};
