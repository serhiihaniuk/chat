import { AgentMark } from "#shared/ui/agent-mark";
import { ChevronDownIcon } from "lucide-react";

// Header identity: the agent mark in an accent tile, the widget title, and (in
// narrow mode) a chevron marking it as the conversation switcher trigger.
export const WidgetHeaderTitle = ({
  showChevron = false,
  title,
}: {
  readonly showChevron?: boolean | undefined;
  readonly title: string;
}) => (
  <span className="flex min-w-0 items-center gap-2.5">
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-accent">
      <AgentMark className="size-4 text-primary" />
    </span>
    <span className="truncate font-semibold text-[0.9375rem] text-card-foreground tracking-tight">
      {title}
    </span>
    {showChevron && (
      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
    )}
  </span>
);
