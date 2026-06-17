import { AgentMark } from "#shared/ui/agent-mark";
import { ChevronDownIcon } from "lucide-react";

// Header identity: a standalone brand mark, the widget title, and (in narrow
// mode) a chevron marking it as the conversation switcher trigger.
export const WidgetHeaderTitle = ({
  showChevron = false,
  title,
}: {
  readonly showChevron?: boolean | undefined;
  readonly title: string;
}) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <AgentMark className="size-4 shrink-0 text-primary/80" />
    <span className="truncate font-semibold text-[0.9375rem] text-card-foreground tracking-tight">
      {title}
    </span>
    {showChevron && <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />}
  </span>
);
