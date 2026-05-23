export type WidgetHarnessMode = "mock-stream" | "local-service";

export type WidgetHarnessConfig = {
  readonly mode: WidgetHarnessMode;
  readonly apiBaseUrl: string;
  readonly authToken: string;
  readonly workspaceId: string;
};

const DEFAULT_API_BASE_URL = "/api";
const DEFAULT_AUTH_TOKEN = "local-test-token";
const DEFAULT_WORKSPACE_ID = "local-dev";

export const parseWidgetHarnessConfig = (
  search: string,
): WidgetHarnessConfig => {
  const params = new URLSearchParams(search);
  const mode = parseMode(params.get("mode"));
  return {
    mode,
    apiBaseUrl: params.get("apiBaseUrl") ?? DEFAULT_API_BASE_URL,
    authToken: params.get("authToken") ?? DEFAULT_AUTH_TOKEN,
    workspaceId: params.get("workspaceId") ?? DEFAULT_WORKSPACE_ID,
  };
};

export const modeLabel = (mode: WidgetHarnessMode): string => {
  switch (mode) {
    case "mock-stream":
      return "Mock stream";
    case "local-service":
      return "Local service";
  }
};

const parseMode = (mode: string | null): WidgetHarnessMode => {
  if (mode === "local-service") return "local-service";
  return "mock-stream";
};
