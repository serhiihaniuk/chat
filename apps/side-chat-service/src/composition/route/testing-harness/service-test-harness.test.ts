import { describe, expect, it } from "vitest";

import { createServiceTestHarness } from "./service-test-harness.js";

describe("service test harness", () => {
  it("covers authentication, readiness, and boot telemetry", async () => {
    let ready = false;
    const harness = await createServiceTestHarness({
      readiness: { check: () => ready },
    });
    try {
      const unauthorized = await harness.unauthenticatedRequest("/api/chat");
      expect(unauthorized.status).toBe(401);
      expect(await unauthorized.json()).toMatchObject({
        code: "unauthorized",
        retryable: false,
        requestId: expect.any(String),
      });
      expect((await harness.request("/api/chat")).status).toBe(404);
      expect((await harness.request("/readyz")).status).toBe(503);
      ready = true;
      expect((await harness.request("/readyz")).status).toBe(200);
      expect(harness.telemetry.records).toContainEqual({
        type: "service.boot",
      });
    } finally {
      await harness.close();
    }
  });

  it("becomes unready after the service scope closes", async () => {
    const harness = await createServiceTestHarness();
    expect((await harness.request("/readyz")).status).toBe(200);
    await harness.close();
    expect((await harness.request("/readyz")).status).toBe(503);
  });
});
