import type { ReactElement } from "react";

import type { WidgetHostCommand } from "#entities/host-command/model";
import { projectHostCommandPart } from "#entities/host-command/projection";
import { Tool } from "#shared/ai/tool";

export type HostCommandPartProps = {
  readonly command: WidgetHostCommand;
};

export const HostCommandPart = ({
  command,
}: HostCommandPartProps): ReactElement => {
  const part = projectHostCommandPart(command);
  return (
    <Tool
      className="side-chat-host-command"
      label={part.label}
      status={part.status}
    />
  );
};
