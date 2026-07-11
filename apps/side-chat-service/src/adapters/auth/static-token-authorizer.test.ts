import { describe, expect, it } from "vitest";

import {
  AuthConfigurationError,
  createStaticTokenAuthorizer,
  normalizeBearerToken,
} from "./static-token-authorizer.js";

describe("static token authorization", () => {
  it("normalizes tokens and returns a bounded workspace identity", async () => {
    const authorizer = createStaticTokenAuthorizer({
      allowDevelopmentToken: true,
      bearerToken: "test-token",
      workspaceId: "workspace-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(
      authorizer.authorize({
        requestId: "request-1",
        bearerToken: "Bearer test-token",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      subjectId: "workspace-1:subject",
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(normalizeBearerToken("test-token")).toBe("Bearer test-token");
  });

  it("rejects the development token in production", () => {
    expect(() =>
      createStaticTokenAuthorizer({
        allowDevelopmentToken: false,
        bearerToken: "local-test-token",
        workspaceId: "workspace-1",
      }),
    ).toThrowError(AuthConfigurationError);
  });
});
