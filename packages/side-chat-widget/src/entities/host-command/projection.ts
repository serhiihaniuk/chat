import type { WidgetHostCommand } from "./model.js";

export type HostCommandPartViewModel = {
  readonly id: string;
  readonly label: string;
  readonly status: string;
};

export const projectHostCommandPart = (
  command: WidgetHostCommand,
): HostCommandPartViewModel => ({
  id: `${command.event.assistantTurnId}:${command.event.sequence}:${command.event.commandId}`,
  label: command.event.commandName,
  status: command.result?.status ?? "pending",
});
