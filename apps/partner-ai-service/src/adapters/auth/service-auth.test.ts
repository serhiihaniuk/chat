import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { describe, expect, it } from "vitest";

import {
  ServiceAuthConfigurationError,
  createServiceAuthVerifier,
  normalizeBearerToken,
  type ServiceAuthConfig,
} from "./service-auth.js";

const WORKSPACE: WorkspaceRef = { tenantId: "tenant_test", workspaceId: "workspace_test" };

const resolve = (config: ServiceAuthConfig, bearerToken: string | undefined) =>
  createServiceAuthVerifier(config).resolveAuthContext({ requestId: "req", bearerToken });

describe("normalizeBearerToken", () => {
  it("adds the Bearer prefix when absent and leaves an already-prefixed token alone", () => {
    expect(normalizeBearerToken("secret")).toBe("Bearer secret");
    expect(normalizeBearerToken("Bearer secret")).toBe("Bearer secret");
  });
});

describe("createServiceAuthVerifier", () => {
  it("authenticates a matching token and rejects a wrong one", async () => {
    const config: ServiceAuthConfig = {
      profile: "production",
      workspace: WORKSPACE,
      trustedBearerToken: "Bearer prod-secret",
    };

    await expect(resolve(config, "Bearer prod-secret")).resolves.toMatchObject({
      workspaceId: "workspace_test",
      source: "signed_service_token",
    });
    await expect(resolve(config, "Bearer wrong")).resolves.toBeUndefined();
    await expect(resolve(config, undefined)).resolves.toBeUndefined();
  });

  it("normalizes a directly-configured token so an un-prefixed secret still authorizes the header", async () => {
    // The option path used to skip the Bearer normalization the config path applied.
    const config: ServiceAuthConfig = {
      profile: "production",
      workspace: WORKSPACE,
      trustedBearerToken: "raw-secret",
    };

    await expect(resolve(config, "Bearer raw-secret")).resolves.toMatchObject({
      workspaceId: "workspace_test",
    });
  });

  it("compares in constant time without throwing on a different-length token", async () => {
    // Hashing both sides to a fixed digest means `timingSafeEqual` never sees
    // unequal lengths (which would throw and leak length); a wrong token of any
    // length simply fails to authenticate.
    const config: ServiceAuthConfig = {
      profile: "development",
      workspace: WORKSPACE,
      devBearerToken: "Bearer dev-secret",
    };

    await expect(resolve(config, "Bearer x")).resolves.toBeUndefined();
    await expect(
      resolve(config, "Bearer a-much-longer-token-than-the-trusted-one"),
    ).resolves.toBeUndefined();
    await expect(resolve(config, "Bearer dev-secret")).resolves.toMatchObject({
      source: "test_authority",
    });
  });

  it("rejects the dev default token under the production profile even without the prefix", () => {
    expect(() =>
      createServiceAuthVerifier({
        profile: "production",
        workspace: WORKSPACE,
        trustedBearerToken: "local-test-token",
      }),
    ).toThrow(ServiceAuthConfigurationError);
  });

  it("flows a configured subject id into the auth context", async () => {
    const config: ServiceAuthConfig = {
      profile: "production",
      workspace: WORKSPACE,
      trustedBearerToken: "Bearer prod-secret",
      subject: { subjectId: "subject_custom", userId: "user_custom" },
    };

    await expect(resolve(config, "Bearer prod-secret")).resolves.toMatchObject({
      subject: { subjectId: "subject_custom" },
    });
  });
});
