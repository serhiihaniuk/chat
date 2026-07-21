import { describe, expect, it } from "vitest";
import type { WidgetHostBridge } from "@side-chat/host-bridge";

import { readClientTools } from "./workflow-widget-chat-engine.js";

describe("readClientTools", () => {
  it("treats an absent capability method as an empty client-tool catalog", async () => {
    await expect(readClientTools({})).resolves.toEqual([]);
  });

  it("replaces a capability-provider failure with a safe integration error", async () => {
    const bridge: WidgetHostBridge = {
      getCapabilities: () => Promise.reject(new Error("PRIVATE_HOST_FAILURE")),
    };

    await expect(readClientTools(bridge)).rejects.toThrow(
      "Host client-tool capabilities could not be loaded.",
    );
  });
});
