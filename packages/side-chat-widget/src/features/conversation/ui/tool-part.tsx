import type { ReactElement } from "react";

import { toolDisplayNames } from "../model/message-view.js";
import type { WidgetToolPart } from "#entities/message/model";
import type { WidgetTool } from "#entities/tool/model";
import { projectToolPart } from "#entities/tool/projection";
import { Tool } from "#shared/ai/tool";
import { cn } from "#shared/lib/cn";

export type ToolPartProps = {
  readonly className?: string;
  readonly tool: WidgetTool | WidgetToolPart;
};

export const ToolPart = ({ className, tool }: ToolPartProps): ReactElement => {
  const part =
    "type" in tool && tool.type === "tool"
      ? {
          label: toolDisplayNames[tool.toolName] ?? tool.toolName,
          status: tool.status,
        }
      : projectToolPart(tool);
  return (
    <Tool
      className={cn("side-chat-tool", className)}
      label={part.label}
      status={part.status}
    />
  );
};
