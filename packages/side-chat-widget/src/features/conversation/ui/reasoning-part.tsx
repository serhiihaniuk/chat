import type { ReactElement } from "react";

import { Reasoning } from "#shared/ai/reasoning";

export type ReasoningPartProps = {
  readonly summary: string;
};

export const ReasoningPart = ({
  summary,
}: ReasoningPartProps): ReactElement => (
  <Reasoning className="side-chat-reasoning">{summary}</Reasoning>
);
