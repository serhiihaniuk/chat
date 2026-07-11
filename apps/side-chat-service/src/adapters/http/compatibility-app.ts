import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";

import {
  cancelCompatibilityTurn,
  runUnpatchedAbortSignalProbe,
  startCompatibilityTurn,
  type CompatibilityTurnRequest,
} from "#workflows/testing/compatibility-turn";

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
      headers: { "x-workflow-run-id": turn.runId },
    });
  });

  app.post("/compatibility/turns/:requestId/cancel", async (context) => {
    const requestId = context.req.param("requestId");
    const cancelled = await cancelCompatibilityTurn(requestId);
    return cancelled ? context.json({ cancelled: true }) : context.json({ cancelled: false }, 404);
  });

  app.post("/compatibility/probes/unpatched-abort-signal", async (context) => {
    return context.json(await runUnpatchedAbortSignalProbe());
  });

  return app;
}
