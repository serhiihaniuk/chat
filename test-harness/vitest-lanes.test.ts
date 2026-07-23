import { describe, expect, it } from "vitest";

import integrationConfig from "../vitest.integration.config.js";

describe("Vitest lane ownership", () => {
  it("keeps every integration test selectable only through the explicit serial lane", () => {
    expect(integrationConfig.test?.include).toEqual([
      "apps/**/*.integration.test.ts",
      "packages/**/*.integration.test.ts",
    ]);
    expect(integrationConfig.test?.exclude).toEqual([]);
    expect(integrationConfig.test?.fileParallelism).toBe(false);
  });
});
