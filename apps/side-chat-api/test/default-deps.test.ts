import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDefaultDeps } from "../src/inbound/hono/index.js";

describe("default dependency wiring from environment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("applies workspace allowlist authorization", async () => {
    process.env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS = "demo-workspace,demo-team";
    const deps = createDefaultDeps();

    await expect(deps.auth.authorize("demo-workspace", "u-1")).resolves.toBe(
      true,
    );
    await expect(deps.auth.authorize("demo-other", "u-1")).resolves.toBe(false);
  });

  it("applies workspace blocklist authorization", async () => {
    process.env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS = "blocked-workspace, banned";
    const deps = createDefaultDeps();

    await expect(deps.auth.authorize("blocked-workspace", "u-1")).resolves.toBe(
      false,
    );
    await expect(deps.auth.authorize("ok-workspace", "u-1")).resolves.toBe(
      true,
    );
  });

  it("toggles rate limiting from environment", async () => {
    process.env.SIDE_CHAT_RATE_LIMITING_ENABLED = "false";
    const deps = createDefaultDeps();

    await expect(deps.rateLimit.check("workspace", "u-1")).resolves.toBe(false);
  });

  it("toggles billing from environment", async () => {
    process.env.SIDE_CHAT_BILLING_ENABLED = "false";
    const deps = createDefaultDeps();

    await expect(deps.billing.allow("workspace")).resolves.toBe(false);
  });

  it("defaults to enabled auth/rate-limits/billing when env is unset", async () => {
    delete process.env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS;
    delete process.env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS;
    delete process.env.SIDE_CHAT_RATE_LIMITING_ENABLED;
    delete process.env.SIDE_CHAT_BILLING_ENABLED;

    const deps = createDefaultDeps();

    await expect(deps.auth.authorize("anything", "u-1")).resolves.toBe(true);
    await expect(deps.rateLimit.check("workspace", "u-1")).resolves.toBe(true);
    await expect(deps.billing.allow("workspace")).resolves.toBe(true);
  });
});
