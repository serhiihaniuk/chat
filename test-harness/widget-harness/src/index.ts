export {
  createHarnessHostBridge,
  createHarnessHostContext,
  type HarnessHostBridge,
  type HarnessHostCommandRecord,
} from "./fake-host-bridge.js";
export {
  createWidgetHarnessApp,
  mountWidgetHarness,
  type WidgetHarnessApp,
} from "./harness-app.js";
import { mountBrowserHarness } from "./harness-app.js";
export { mountBrowserHarness };
export {
  createLocalServiceClient,
  withLocalAuth,
} from "./local-service-client.js";
export {
  createMockEvents,
  createMockStreamClient,
} from "./mock-stream-client.js";
export {
  modeLabel,
  parseWidgetHarnessConfig,
  type WidgetHarnessConfig,
  type WidgetHarnessMode,
} from "./modes.js";

if (typeof document !== "undefined") {
  mountBrowserHarness();
}
