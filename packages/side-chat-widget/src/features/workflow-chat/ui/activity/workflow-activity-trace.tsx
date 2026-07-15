import { useEffect, useState, type ReactElement } from "react";

import { MarkdownContent } from "#shared/ai/markdown-content";
import type { WidgetLabels } from "#shared/lib/widget-labels";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";

// The trace opens only while reasoning is the active output. The first answer
// text collapses it; completed history stays closed unless the user opens it.
export function WorkflowActivityTrace({
  activityDurationMs,
  isStreaming,
  items,
  labels,
  thinking,
}: {
  readonly activityDurationMs: number | undefined;
  readonly isStreaming: boolean;
  readonly items: readonly ReasoningItem[];
  readonly labels: WidgetLabels;
  readonly thinking: boolean;
}): ReactElement {
  const [open, setOpen] = useState(thinking);
  useEffect(() => {
    setOpen(thinking);
  }, [thinking]);
  return (
    <Reasoning
      items={items}
      label={activityLabel(activityDurationMs, thinking, labels)}
      onOpenChange={setOpen}
      open={open}
      renderThought={(text) => (
        <div className="text-sm text-muted-foreground">
          <MarkdownContent mode={isStreaming ? "streaming" : "static"}>{text}</MarkdownContent>
        </div>
      )}
      thinking={thinking}
    />
  );
}

function activityLabel(
  activityDurationMs: number | undefined,
  thinking: boolean,
  labels: WidgetLabels,
): string {
  if (thinking) return labels.activityThinking;
  if (activityDurationMs === undefined) return labels.activityThoughtProcess;
  return labels.activityThoughtForSeconds(Math.max(1, Math.ceil(activityDurationMs / 1_000)));
}
