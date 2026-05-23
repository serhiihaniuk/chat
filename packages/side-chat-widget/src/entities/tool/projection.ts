import type { WidgetTool } from "./model.js";

export type ToolPartViewModel = {
  readonly id: string;
  readonly label: string;
  readonly status: string;
};

export const projectToolPart = (tool: WidgetTool): ToolPartViewModel => ({
  id: `${tool.assistantTurnId}:${tool.sequence}:${tool.toolCallId}`,
  label: tool.toolName,
  status: tool.status,
});
