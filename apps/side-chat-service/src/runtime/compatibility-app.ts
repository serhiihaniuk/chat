import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { resumeHook, start } from "workflow/api";

import {
  probeUnpatchedAbortSignal,
  runCompatibilityTurn,
  turnCancellationHookToken,
  type CompatibilityTurnRequest,
} from "./turn-workflow.js";

/**
 * Credential-free compatibility surface, mounted only when
 * SIDECHAT_TEST_COMPOSITION is enabled. It exercises the real substrate:
 * durable workflow runs, the run's readable as the UI message stream, and
 * hook-based cancellation.
 */
const app = new Hono();

app.post("/compatibility/turns", async (context) => {
  const request = await context.req.json<CompatibilityTurnRequest>();
  const run = await start(runCompatibilityTurn, [request]);

  return createUIMessageStreamResponse({
    stream: run.getReadable<ModelCallStreamPart>().pipeThrough(createModelCallToUIChunkTransform()),
    headers: { "x-workflow-run-id": run.runId },
  });
});

app.post("/compatibility/turns/:requestId/cancel", async (context) => {
  const requestId = context.req.param("requestId");
  try {
    await resumeHook(turnCancellationHookToken(requestId), { reason: "user pressed stop" });
    return context.json({ cancelled: true });
  } catch {
    // The durable hook registers when the turn workflow first suspends; a
    // cancel that arrives earlier (or for an unknown turn) finds no hook.
    return context.json({ cancelled: false }, 404);
  }
});

app.post("/compatibility/probes/unpatched-abort-signal", async (context) => {
  const run = await start(probeUnpatchedAbortSignal, []);
  return context.json(await run.returnValue);
});

export default app;
