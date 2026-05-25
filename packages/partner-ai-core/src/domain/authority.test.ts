import { describe, expect, it } from "vitest";
import {
  AUTHORITY_DENIAL_CODES,
  PRODUCTION_AUTHORITY_INVARIANT,
  assertRequiredScope,
  assertWorkspaceAuthority,
  requireAuthContext,
  type AuthContext,
} from "./authority.js";

const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  hostOrigin: "https://host.example",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

describe("normalized authority contract", () => {
  it("fails closed before protected work when trusted auth is missing", () => {
    expect(requireAuthContext(undefined)).toEqual({
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.MISSING_AUTH,
      message: "A trusted AuthContext is required before protected work runs.",
    });
  });

  it("denies cross-tenant or cross-workspace access", () => {
    const decision = assertWorkspaceAuthority(authContext, {
      tenantId: "tenant_002",
      workspaceId: "workspace_001",
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.CROSS_TENANT_WORKSPACE,
    });
  });

  it("keeps host-provided context outside authoritative identity", () => {
    expect(requireAuthContext(undefined)).toMatchObject({
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.MISSING_AUTH,
    });
  });

  it("requires explicit scopes from trusted authority", () => {
    expect(assertRequiredScope(authContext, "audit:write")).toMatchObject({
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.MISSING_SCOPE,
    });
  });

  it("documents the production fail-closed invariant", () => {
    expect(PRODUCTION_AUTHORITY_INVARIANT).toContain("fail closed");
    expect(PRODUCTION_AUTHORITY_INVARIANT).toContain("host context never");
  });
});
