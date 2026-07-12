import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";

import {
  cancelCompatibilityTurn,
  runNativeApprovalGapProbe,
  runUnpatchedAbortSignalProbe,
  startCompatibilityTurn,
  type CompatibilityTurnRequest,
} from "#workflows/testing/compatibility-turn";
import { inspectTestingChatTurnJournal } from "#workflows/testing/chat-turn";
import {
  approveWrapperApprovalGate,
  startWrapperApprovalGateProbe,
} from "#workflows/testing/probes/wrapper-approval-gate";

import { HTTP_ERROR } from "./error-response.js";
import { HTTP_HEADERS } from "./http-contract.js";

/**
 * Credential-free compatibility surface for the testing route composition.
 * The route owns HTTP translation only. The separately compiled testing
 * workflow bundle selects its scripted model through its own composition
 * entry because route and workflow module state is not shared.
 */
export function createCompatibilityApp(): Hono {
  const app = new Hono();

  app.post("/compatibility/turns", async (context) => {
    const request = await context.req.json<CompatibilityTurnRequest>();
    const turn = await startCompatibilityTurn(request);

    return createUIMessageStreamResponse({
      stream: turn.stream,
      headers: { [HTTP_HEADERS.WORKFLOW_RUN_ID]: turn.runId },
    });
  });

  app.post("/compatibility/turns/:requestId/cancel", async (context) => {
    const requestId = context.req.param("requestId");
    const cancelled = await cancelCompatibilityTurn(requestId);
    return cancelled
      ? context.json({ cancelled: true })
      : context.json({ cancelled: false }, HTTP_ERROR.NOT_FOUND.STATUS);
  });

  app.post("/compatibility/probes/unpatched-abort-signal", async (context) => {
    return context.json(await runUnpatchedAbortSignalProbe());
  });

  app.post("/compatibility/probes/native-needs-approval-gap", async (context) => {
    const request = await context.req.json<{ requestId: string }>();
    return context.json(await runNativeApprovalGapProbe(request.requestId));
  });

  app.post("/compatibility/probes/wrapper-approval-gate", async (context) => {
    const request = await context.req.json<{ requestId: string }>();
    return context.json(await startWrapperApprovalGateProbe(request.requestId));
  });

  app.post(
    "/compatibility/probes/wrapper-approval-gate/:runId/:approvalId",
    async (context) => {
      const resumed = await approveWrapperApprovalGate(
        context.req.param("runId"),
        context.req.param("approvalId"),
      );
      return context.json({ resumed }, resumed ? 200 : 404);
    },
  );

  app.get("/compatibility/chat-turns/:runId/journal-shape", async (context) => {
    return context.json(await inspectTestingChatTurnJournal(context.req.param("runId")));
  });

  return app;
}
