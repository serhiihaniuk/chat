import type { ReactElement } from "react";

import { Reasoning } from "#shared/ai/reasoning";
import { cn } from "#shared/lib/cn";

export type ReasoningPartProps = {
  readonly className?: string;
  readonly summary: string;
};

export const ReasoningPart = ({
  className,
  summary,
}: ReasoningPartProps): ReactElement => (
  <Reasoning className={cn("side-chat-reasoning", className)}>
    {summary}
  </Reasoning>
);
