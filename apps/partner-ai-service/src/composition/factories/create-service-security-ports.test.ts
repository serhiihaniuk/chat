import { describe, expect, it } from "vitest";
import { createServiceSecurityPorts } from "./create-service-security-ports.js";

const workspace = { tenantId: "tenant_sec", workspaceId: "workspace_sec" } as const;

describe("createServiceSecurityPorts", () => {
  it("falls back to a development auth profile and matching policy when none are given", () => {
    const security = createServiceSecurityPorts({ workspace });

    expect(security.auth.profile).toBe("development");
    expect(security.policies.profile).toBe("development");
  });

  it("keeps explicit auth and policy config instead of rebuilding defaults", () => {
    const auth = { profile: "production", workspace, trustedBearerToken: "Bearer secret" } as const;
    const policies = { profile: "production", mode: "fail_closed" } as const;

    const security = createServiceSecurityPorts({ workspace, auth, policies });

    expect(security.auth).toBe(auth);
    expect(security.policies).toBe(policies);
  });
});
