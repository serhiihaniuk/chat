import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES } from "#adapters/http/http-contract";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { CHAT_REQUEST_MAX_BYTES } from "../chat-routes.js";

describe("chat request limits", () => {
  it("rejects an oversized streamed body before admission or execution", async () => {
    const admission = new DeterministicTurnAdmission();
    const execution = {
      start: vi.fn<TurnExecution["start"]>(async () => {
        throw new Error("Oversized requests must not start execution.");
      }),
      resume: vi.fn<TurnExecution["resume"]>(async () => {
        throw new Error("Oversized requests must not resume execution.");
      }),
      cancel: vi.fn<TurnExecution["cancel"]>(() => Promise.resolve()),
    } satisfies TurnExecution;
    const harness = await createServiceTestHarness({
      turnAdmission: admission,
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, {
        method: "POST",
        body: JSON.stringify({ padding: "x".repeat(CHAT_REQUEST_MAX_BYTES) }),
      });

      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(admission.admitted).toBe(0);
      expect(execution.start).not.toHaveBeenCalled();
      expect(execution.resume).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });
});
