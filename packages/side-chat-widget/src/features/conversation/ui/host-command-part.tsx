import type { ReactElement } from "react";

import type { WidgetHostCommandPart } from "#entities/message/model";
import type { WidgetHostCommand } from "#entities/host-command/model";
import { projectHostCommandPart } from "#entities/host-command/projection";
import { Tool } from "#shared/ai/tool";
import { cn } from "#shared/lib/cn";

export type HostCommandPartProps = {
  readonly className?: string;
  readonly command?: WidgetHostCommand;
  readonly commandPart?: WidgetHostCommandPart;
};

export const HostCommandPart = ({
  className,
  command,
  commandPart,
}: HostCommandPartProps): ReactElement => {
  const part = resolveHostCommandPart(commandPart, command);
  return (
    <Tool
      className={cn("side-chat-host-command", className)}
      label={part.label}
      status={part.status}
    />
  );
};

const resolveHostCommandPart = (
  commandPart: WidgetHostCommandPart | undefined,
  command: WidgetHostCommand | undefined,
): { readonly label: string; readonly status: string } => {
  if (commandPart) {
    return { label: commandPart.commandName, status: commandPart.status };
  }
  if (command) return projectHostCommandPart(command);
  return { label: "Host command", status: "pending" };
};
