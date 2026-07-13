import { WorkflowAgent, type WorkflowAgentOptions } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, type ToolSet } from "ai";
import { getWritable } from "workflow";
import { start } from "workflow/api";

import { assertDurableModelHandle } from "#application/ports/model-provider";
import { initializeTestingWorkflowServices } from "#composition/workflow/testing";

const PROBE = {
  AGENT_ID: "side-chat-native-approval-gap",
  INSTRUCTIONS: "Execute the requested compatibility probe.",
  MAX_STEPS: 2,
  MODEL_ID: "native-approval-gap",
  OBSERVATION_PREFIX: "[compatibility-observation]",
  EXECUTED_EVENT: "native-approval-tool-executed",
} as const;

export interface NativeApprovalGapOutcome {
  readonly stepCount: number;
  readonly toolCallsCount: number;
  readonly toolResultsCount: number;
}

export async function runNativeApprovalGapProbe(
  requestId: string,
): Promise<NativeApprovalGapOutcome> {
  const run = await start(probeNativeApprovalGap, [requestId]);
  return run.returnValue;
}

/** Characterize whether pinned WorkflowAgent executes despite `needsApproval`. */
export async function probeNativeApprovalGap(requestId: string): Promise<NativeApprovalGapOutcome> {
  "use workflow";

  const { modelProvider } = initializeTestingWorkflowServices();
  const resolvedModel = modelProvider.modelFor({ modelId: PROBE.MODEL_ID, requestId });
  assertDurableModelHandle(resolvedModel.model);
  const agent = new WorkflowAgent({
    id: PROBE.AGENT_ID,
    model: resolvedModel.model,
    instructions: PROBE.INSTRUCTIONS,
    stopWhen: isStepCount(PROBE.MAX_STEPS),
    maxRetries: 0,
    tools: nativeApprovalProbeTools(),
    ...(resolvedModel.providerOptions === undefined
      ? {}
      : { providerOptions: resolvedModel.providerOptions }),
  } satisfies WorkflowAgentOptions);
  const result = await agent.stream({
    messages: [{ role: "user", content: "run the risky tool" }],
    writable: getWritable(),
  });
  return {
    stepCount: result.steps.length,
    toolCallsCount: result.toolCalls.length,
    toolResultsCount: result.toolResults.length,
  };
}

function nativeApprovalProbeTools(): ToolSet {
  return {
    riskyTool: {
      description: "A destructive compatibility probe tool",
      inputSchema: jsonSchema<{ action: string }>({
        type: "object",
        properties: { action: { type: "string" } },
        required: ["action"],
        additionalProperties: false,
      }),
      needsApproval: true,
      execute: executeNativeApprovalProbeTool,
    },
  };
}

async function executeNativeApprovalProbeTool(
  _input: { action: string },
  options: { toolCallId: string },
): Promise<string> {
  "use step";

  await Promise.resolve();
  console.log(
    `${PROBE.OBSERVATION_PREFIX} ${JSON.stringify({
      event: PROBE.EXECUTED_EVENT,
      requestId: options.toolCallId.replace("native-approval-", ""),
      toolCallId: options.toolCallId,
    })}`,
  );
  return "risky tool executed";
}
