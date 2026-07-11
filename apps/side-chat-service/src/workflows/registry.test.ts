import { afterEach, describe, expect, it } from "vitest";

import {
  resetTestingWorkflowServices,
  initializeTestingWorkflowServices,
} from "#composition/workflow/testing";
import { scriptedModelProvider } from "#testing/scripted-language-model";

import { initializeWorkflowServices, workflowServices } from "./registry.js";

describe("workflow-bundle registry", () => {
  afterEach(resetTestingWorkflowServices);

  it("rejects access before bundle composition initializes it", () => {
    expect(() => workflowServices()).toThrow("before composition initialized");
  });

  it("stores typed workflow dependencies and rejects replacement", () => {
    const services = initializeTestingWorkflowServices();

    expect(services.modelProvider).toBe(scriptedModelProvider);
    expect(() => initializeWorkflowServices(services)).toThrow(
      "already initialized",
    );
  });
});
