import type { ReactElement } from "react";

import { AssistantMessage } from "./assistant-message.js";
import type { WidgetMessage } from "#entities/message/model";
import { Message, MessageContent, MessageRoleLabel } from "#shared/ai/message";

export type MessageRowProps = {
  readonly message: WidgetMessage;
};

export const MessageRow = ({ message }: MessageRowProps): ReactElement => (
  <Message
    className={`side-chat-message side-chat-message--${message.role}`}
    from={message.role}
  >
    <MessageRoleLabel>{message.role}</MessageRoleLabel>
    {message.role === "assistant" ? (
      <AssistantMessage message={message} />
    ) : (
      <MessageContent>{message.content}</MessageContent>
    )}
  </Message>
);
