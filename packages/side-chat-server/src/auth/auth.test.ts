import { describe, expect, it } from "vitest";

import { toDurableActorRef } from "./index.js";

describe("durable actor reference", () => {
  it("projects only stable identity from request authentication", () => {
    expect(
      toDurableActorRef({
        workspaceId: "workspace-1",
        subjectId: "subject-1",
        issuedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({ workspaceId: "workspace-1", subjectId: "subject-1" });
  });
});
