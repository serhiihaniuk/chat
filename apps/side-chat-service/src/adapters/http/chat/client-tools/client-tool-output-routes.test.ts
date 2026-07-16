import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ResumeClientTool } from "#application/turn/tools/submit-client-tool-output";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";

import { digestClientToolCapability } from "./authority/client-tool-capability.js";

const RUN_ID = "run-1";
const TOOL_CALL_ID = "call-1";
const CLIENT_TOOL_CAPABILITY = "a".repeat(64);
const DISPATCH = {
  workspaceId: "local-workspace",
  turnId: "turn-1",
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
} as const;

describe("client-tool output route", () => {
  it("hides a missing originating-tab capability before dispatch lookup", async () => {
    const findOwned = vi.fn<ClientToolDispatchStore["findOwned"]>();
    const harness = await createServiceTestHarness({
      clientToolDispatches: { findOwned, submit: vi.fn<ClientToolDispatchStore["submit"]>() },
    });
    try {
      const response = await harness.request(outputRoute(RUN_ID, TOOL_CALL_ID), {
        method: "POST",
        body: JSON.stringify({ output: "private" }),
      });

      expect(response.status).toBe(HTTP_ERROR.NOT_FOUND.STATUS);
      expect(findOwned).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it("hides a wrong capability before handling a malformed private body", async () => {
    const privateSentinel = "PRIVATE_MALFORMED_OUTPUT";
    const submit = vi.fn<ClientToolDispatchStore["submit"]>();
    const findOwned = vi.fn<ClientToolDispatchStore["findOwned"]>(
      async (_auth, _runId, _toolCallId, capabilityDigest) =>
        capabilityDigest === digestClientToolCapability(CLIENT_TOOL_CAPABILITY)
          ? DISPATCH
          : CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND,
    );
    const harness = await createServiceTestHarness({
      clientToolDispatches: { findOwned, submit },
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, TOOL_CALL_ID),
        outputRequest(privateSentinel, false, "b".repeat(64)),
      );
      const responseText = await response.text();

      expect(response.status).toBe(HTTP_ERROR.NOT_FOUND.STATUS);
      expect(responseText).not.toContain(privateSentinel);
      expect(findOwned).toHaveBeenCalledOnce();
      expect(submit).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it("settles without echoing the private payload", async () => {
    const privateSentinel = "PRIVATE_CLIENT_TOOL_OUTPUT_SENTINEL";
    const submit = acceptedSubmit();
    const resumeClientTool = vi.fn<ResumeClientTool>(async () => true);
    const harness = await createServiceTestHarness({
      clientToolDispatches: { findOwned: async () => DISPATCH, submit },
      resumeClientTool,
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, TOOL_CALL_ID),
        outputRequest({ output: { value: privateSentinel } }),
      );
      const responseText = await response.text();
      expect(response.status).toBe(200);
      expect(responseText).not.toContain(privateSentinel);
      expect(JSON.parse(responseText)).toEqual({
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
        state: "settled",
        accepted: true,
      });
      expect(resumeClientTool).toHaveBeenCalledOnce();
    } finally {
      await harness.close();
    }
  });

  it("turns a malformed body into a typed failed model result", async () => {
    const submit = acceptedSubmit();
    const harness = await createServiceTestHarness({
      clientToolDispatches: { findOwned: async () => DISPATCH, submit },
      resumeClientTool: async () => true,
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, TOOL_CALL_ID),
        outputRequest("not-json", false),
      );
      expect(response.status).toBe(200);
      expect(submit.mock.calls[0]?.[1]).toBe("failed");
      expect(submit.mock.calls[0]?.[2]).toEqual({
        value: { status: "failed", errorCode: "invalid_client_tool_output" },
      });
    } finally {
      await harness.close();
    }
  });

  it("hides unknown runs and calls before accepting their result", async () => {
    const submit = vi.fn<ClientToolDispatchStore["submit"]>();
    const harness = await createServiceTestHarness({
      clientToolDispatches: {
        findOwned: async () => CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND,
        submit,
      },
    });
    try {
      const response = await harness.request(
        outputRoute("unknown-run", "guessed-call"),
        outputRequest({ output: "secret" }),
      );
      expect(response.status).toBe(HTTP_ERROR.NOT_FOUND.STATUS);
      expect(submit).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it("returns a retryable conflict while the owned call is not yet anchored", async () => {
    const harness = await createServiceTestHarness({
      clientToolDispatches: {
        findOwned: async () => CLIENT_TOOL_DISPATCH_LOOKUP.NOT_READY,
        submit: vi.fn<ClientToolDispatchStore["submit"]>(),
      },
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, "call-racing"),
        outputRequest({ output: "result" }),
      );
      expect(response.status).toBe(HTTP_ERROR.CONFLICT.STATUS);
      expect(response.headers.get(HTTP_HEADERS.RETRY_AFTER)).toBe("1");
      expect(await response.json()).toMatchObject({
        code: HTTP_ERROR.CONFLICT.CODE,
        retryable: true,
      });
    } finally {
      await harness.close();
    }
  });

  it("returns a retryable conflict when the first writer's hook is not yet registered", async () => {
    const harness = await createServiceTestHarness({
      clientToolDispatches: {
        findOwned: async () => DISPATCH,
        submit: acceptedSubmit(),
      },
      resumeClientTool: async () => false,
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, TOOL_CALL_ID),
        outputRequest({ output: "result" }),
      );
      expect(response.status).toBe(HTTP_ERROR.CONFLICT.STATUS);
      expect(response.headers.get(HTTP_HEADERS.RETRY_AFTER)).toBe("1");
    } finally {
      await harness.close();
    }
  });

  it("returns the recorded outcome when a duplicate result arrives after settle", async () => {
    const submit = vi.fn<ClientToolDispatchStore["submit"]>(async () => ({
      disposition: "duplicate",
      state: "settled",
      output: { value: "already-recorded" },
    }));
    const resumeClientTool = vi.fn<ResumeClientTool>(async () => false);
    const harness = await createServiceTestHarness({
      clientToolDispatches: { findOwned: async () => DISPATCH, submit },
      resumeClientTool,
    });
    try {
      const response = await harness.request(
        outputRoute(RUN_ID, TOOL_CALL_ID),
        outputRequest({ output: { value: "resent" } }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        runId: RUN_ID,
        toolCallId: TOOL_CALL_ID,
        state: "settled",
        accepted: false,
      });
      expect(resumeClientTool).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });
});

function acceptedSubmit() {
  return vi.fn<ClientToolDispatchStore["submit"]>(async (_dispatch, state, output) => ({
    disposition: "accepted",
    state,
    output,
  }));
}

function outputRoute(runId: string, toolCallId: string): string {
  return CHAT_HTTP_ROUTES.CLIENT_TOOL_OUTPUT.replace(":runId", runId).replace(
    ":toolCallId",
    toolCallId,
  );
}

function outputRequest(
  body: unknown,
  serialize = true,
  clientToolCapability = CLIENT_TOOL_CAPABILITY,
): RequestInit {
  return {
    method: "POST",
    headers: { [HTTP_HEADERS.CLIENT_TOOL_CAPABILITY]: clientToolCapability },
    body: serialize ? JSON.stringify(body) : String(body),
  };
}
