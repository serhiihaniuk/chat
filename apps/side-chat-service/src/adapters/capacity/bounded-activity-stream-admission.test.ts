import { describe, expect, it } from "vitest";

import { ACTIVITY_STREAM_REJECTION_REASONS } from "#application/ports/activity-stream-admission";
import { BoundedActivityStreamAdmission } from "./bounded-activity-stream-admission.js";

const subjectA = { workspaceId: "workspace-1", subjectId: "subject-a" };
const subjectB = { workspaceId: "workspace-1", subjectId: "subject-b" };

describe("BoundedActivityStreamAdmission", () => {
  it("bounds each authenticated workspace and subject independently", () => {
    const admission = createAdmission({ maxActiveStreams: 3, maxActiveStreamsPerSubject: 1 });

    expect(admission.tryAcquire(subjectA).accepted).toBe(true);
    expect(admission.tryAcquire(subjectA)).toEqual({
      accepted: false,
      reason: ACTIVITY_STREAM_REJECTION_REASONS.SUBJECT_CAPACITY,
    });
    expect(admission.tryAcquire(subjectB).accepted).toBe(true);
  });

  it("bounds aggregate activity streams in one process", () => {
    const admission = createAdmission({ maxActiveStreams: 1, maxActiveStreamsPerSubject: 1 });

    expect(admission.tryAcquire(subjectA).accepted).toBe(true);
    expect(admission.tryAcquire(subjectB)).toEqual({
      accepted: false,
      reason: ACTIVITY_STREAM_REJECTION_REASONS.PROCESS_CAPACITY,
    });
  });

  it("makes explicit lease release idempotent", () => {
    const admission = createAdmission({ maxActiveStreams: 1, maxActiveStreamsPerSubject: 1 });
    const acquired = admission.tryAcquire(subjectA);
    expect(acquired.accepted).toBe(true);
    if (!acquired.accepted) return;

    acquired.lease.release();
    acquired.lease.release();

    expect(admission.snapshot(subjectA)).toEqual({ active: 0, activeForSubject: 0 });
    expect(admission.tryAcquire(subjectA).accepted).toBe(true);
  });

  it.each([
    [{ maxActiveStreams: 0 }, "maxActiveStreams must be a positive integer"],
    [{ maxActiveStreamsPerSubject: 0 }, "maxActiveStreamsPerSubject must be a positive integer"],
    [
      { maxActiveStreams: 1, maxActiveStreamsPerSubject: 2 },
      "maxActiveStreamsPerSubject must not exceed maxActiveStreams",
    ],
  ] as const)("rejects invalid options", (overrides, message) => {
    expect(() => createAdmission(overrides)).toThrow(message);
  });
});

function createAdmission(
  overrides: Partial<ConstructorParameters<typeof BoundedActivityStreamAdmission>[0]> = {},
): BoundedActivityStreamAdmission {
  return new BoundedActivityStreamAdmission({
    maxActiveStreams: 2,
    maxActiveStreamsPerSubject: 2,
    ...overrides,
  });
}
