import { describe, expect, it } from "vitest";

import { createWorkflowClientToolCapability } from "./workflow-client-tool-capability.js";

describe("createWorkflowClientToolCapability", () => {
  it("creates independent 256-bit lowercase hexadecimal capabilities", () => {
    const first = createWorkflowClientToolCapability();
    const second = createWorkflowClientToolCapability();

    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).not.toBe(first);
  });
});
