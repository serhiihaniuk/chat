import { describe, expect, it } from "vitest";

import { createHttpApp } from "#adapters/inbound/http/health-app";

describe("health routes", () => {
  it("distinguishes liveness from readiness", async () => {
    let ready = false;
    const app = createHttpApp({ isReady: () => ready });

    expect((await app.request("/healthz")).status).toBe(200);
    expect((await app.request("/readyz")).status).toBe(503);
    ready = true;
    expect((await app.request("/readyz")).status).toBe(200);
  });
});
