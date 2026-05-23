import type { ReactElement } from "react";

import type { WidgetTool } from "#entities/tool/model";
import { projectToolPart } from "#entities/tool/projection";
import { Tool } from "#shared/ai/tool";

export type ToolPartProps = {
  readonly tool: WidgetTool;
};

export const ToolPart = ({ tool }: ToolPartProps): ReactElement => {
  const part = projectToolPart(tool);
  return (
    <Tool className="side-chat-tool" label={part.label} status={part.status} />
  );
};
