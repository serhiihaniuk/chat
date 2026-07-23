import { describe, expect, it } from "vitest";

import { createServiceAuthorizer } from "./create-service-authorizer.js";
import { ProductionAuthBindingError } from "./production-request-authorizer.js";
import { createStaticTokenAuthorizer, normalizeBearerToken } from "./static-token-authorizer.js";

describe("static token authorization", () => {
  it("normalizes tokens and returns a bounded workspace identity", async () => {
    const authorizer = createStaticTokenAuthorizer({
      bearerToken: "test-token",
      workspaceId: "workspace-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(
      authorizer.authorize({ requestId: "request-1", bearerToken: "Bearer test-token" }),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      subjectId: "workspace-1:subject",
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(normalizeBearerToken("test-token")).toBe("Bearer test-token");
  });

  it("does not authenticate a missing or different bearer token", async () => {
    const authorizer = createStaticTokenAuthorizer({
      bearerToken: "test-token",
      workspaceId: "workspace-1",
    });

    await expect(authorizer.authorize({ requestId: "request-1" })).resolves.toBeUndefined();
    await expect(
      authorizer.authorize({ requestId: "request-1", bearerToken: "Bearer other-token" }),
    ).resolves.toBeUndefined();
  });

  it("fails closed until production binds an app-local RequestAuthorizer", () => {
    expect(() => createServiceAuthorizer({ profile: "production" })).toThrowError(
      ProductionAuthBindingError,
    );
  });
});
