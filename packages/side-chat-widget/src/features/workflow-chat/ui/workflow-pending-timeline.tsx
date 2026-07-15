import type { ReactElement } from "react";

import { useWidgetLabels } from "#shared/lib/widget-labels";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";

/** Visible placeholder while a native run is submitting, reattaching, or reconciling. */
export function WorkflowPendingTimeline(): ReactElement {
  const labels = useWidgetLabels();
  const items: readonly ReasoningItem[] = [
    { id: "workflow-pending-reasoning", kind: "thought", text: labels.activityPreparing },
  ];
  return (
    <Reasoning
      items={items}
      label={labels.activityThinking}
      onOpenChange={() => undefined}
      open
      thinking
    />
  );
}
