import type { AuthContext } from "@side-chat/side-chat-server";
import {
  ACTIVITY_STREAM_REJECTION_REASONS,
  type ActivityStreamAdmission,
  type ActivityStreamAdmissionResult,
  type ActivityStreamLease,
} from "#application/ports/activity-stream-admission";

export type ActivityStreamAdmissionSnapshot = Readonly<{
  active: number;
  activeForSubject: number;
}>;

/**
 * Bounds process-local activity fan-out independently from turn admission.
 * A lease follows its response stream so every terminal path returns both the
 * process slot and the authenticated workspace/subject slot exactly once.
 */
export class BoundedActivityStreamAdmission implements ActivityStreamAdmission {
  readonly #maxActiveStreams: number;
  readonly #maxActiveStreamsPerSubject: number;
  readonly #activeBySubject = new Map<string, number>();
  #active = 0;

  constructor(options: {
    readonly maxActiveStreams: number;
    readonly maxActiveStreamsPerSubject: number;
  }) {
    requirePositiveInteger(options.maxActiveStreams, "maxActiveStreams");
    requirePositiveInteger(options.maxActiveStreamsPerSubject, "maxActiveStreamsPerSubject");
    if (options.maxActiveStreamsPerSubject > options.maxActiveStreams) {
      throw new RangeError("maxActiveStreamsPerSubject must not exceed maxActiveStreams");
    }
    this.#maxActiveStreams = options.maxActiveStreams;
    this.#maxActiveStreamsPerSubject = options.maxActiveStreamsPerSubject;
  }

  tryAcquire(auth: Pick<AuthContext, "workspaceId" | "subjectId">): ActivityStreamAdmissionResult {
    const key = subjectKey(auth);
    const activeForSubject = this.#activeBySubject.get(key) ?? 0;
    if (activeForSubject >= this.#maxActiveStreamsPerSubject) {
      return { accepted: false, reason: ACTIVITY_STREAM_REJECTION_REASONS.SUBJECT_CAPACITY };
    }
    if (this.#active >= this.#maxActiveStreams) {
      return { accepted: false, reason: ACTIVITY_STREAM_REJECTION_REASONS.PROCESS_CAPACITY };
    }

    this.#active += 1;
    this.#activeBySubject.set(key, activeForSubject + 1);
    return { accepted: true, lease: this.#createLease(key) };
  }

  snapshot(auth: Pick<AuthContext, "workspaceId" | "subjectId">): ActivityStreamAdmissionSnapshot {
    return {
      active: this.#active,
      activeForSubject: this.#activeBySubject.get(subjectKey(auth)) ?? 0,
    };
  }

  #createLease(key: string): ActivityStreamLease {
    let active = true;
    const release = (): void => {
      if (!active) return;
      active = false;
      this.#active -= 1;
      const nextForSubject = (this.#activeBySubject.get(key) ?? 1) - 1;
      if (nextForSubject === 0) this.#activeBySubject.delete(key);
      else this.#activeBySubject.set(key, nextForSubject);
    };
    return {
      release,
    };
  }
}

function subjectKey(auth: Pick<AuthContext, "workspaceId" | "subjectId">): string {
  return JSON.stringify([auth.workspaceId, auth.subjectId]);
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
