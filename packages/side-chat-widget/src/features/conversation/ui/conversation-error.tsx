import type { ReactElement } from "react";

export type ConversationErrorProps = {
  readonly message: string;
};

export const ConversationError = ({
  message,
}: ConversationErrorProps): ReactElement => (
  <p
    className="side-chat-error ml-[6.5rem] text-xl leading-7 text-red-700"
    role="alert"
  >
    {message}
  </p>
);
