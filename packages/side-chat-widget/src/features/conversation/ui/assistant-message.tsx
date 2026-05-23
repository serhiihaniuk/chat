import type { ReactElement } from "react";

import { Response } from "#shared/ai/response";

export type AssistantMessageProps = {
  readonly content: string;
};

export const AssistantMessage = ({
  content,
}: AssistantMessageProps): ReactElement => <Response>{content}</Response>;
