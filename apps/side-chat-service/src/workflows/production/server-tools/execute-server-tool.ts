import type { ToolApprovalInput } from "#application/ports/turn/tools/tool-approval-store";
import type { ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import {
  findConfiguredProductionServerTool,
  initializeProductionWorkflowServices,
} from "#composition/workflow/production";
import {
  requiresServerToolApproval,
  type ServerToolDefinition,
  type ServerToolTextGenerator,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import { generateText } from "ai";
import {
  deniedToolOutput,
  TOOL_APPROVAL_DENIAL_REASONS,
} from "../../tool-approvals/approval-output.js";

export type ApprovedServerToolExecutionCommand = Readonly<{
  toolName: string;
  input: ToolApprovalInput;
  executionKey: string;
}>;

/** Reload current policy/schema inside the idempotent mutating activity. */
export async function runApprovedServerToolStep(
  command: ApprovedServerToolExecutionCommand,
): Promise<unknown> {
  "use step";

  const definition = findConfiguredProductionServerTool(command.toolName);
  const modelProvider = initializeProductionWorkflowServices().modelProvider;
  return executeApprovedServerTool(definition, command, {
    generateText: createServerToolTextGenerator(modelProvider, command.executionKey),
  });
}

export async function executeApprovedServerTool<Input extends ToolApprovalInput>(
  definition: ServerToolDefinition<Input> | undefined,
  command: ApprovedServerToolExecutionCommand,
  dependencies: Readonly<{
    generateText?: ServerToolTextGenerator | undefined;
  }> = {},
): Promise<unknown> {
  if (definition === undefined) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.TOOL_CHANGED);
  }
  if (!definition.validateInput(command.input)) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.SCHEMA_CHANGED);
  }
  if (!(await requiresServerToolApproval(definition.approvalPolicy, command.input))) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.POLICY_CHANGED);
  }
  return definition.execute(command.input, {
    executionKey: command.executionKey,
    ...(dependencies.generateText === undefined ? {} : { generateText: dependencies.generateText }),
  });
}

function createServerToolTextGenerator(
  modelProvider: ModelProvider,
  executionKey: string,
): ServerToolTextGenerator {
  return async (request) => {
    const resolved = modelProvider.modelFor({
      modelId: request.modelId,
      requestId: `${executionKey}:internal-model`,
    });
    const result = await generateText({
      model: resolved.model,
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      maxRetries: 0,
      experimental_telemetry: PRIVATE_TELEMETRY_OPTIONS,
      ...(resolved.providerOptions === undefined
        ? {}
        : { providerOptions: resolved.providerOptions }),
    });
    return result.text;
  };
}
