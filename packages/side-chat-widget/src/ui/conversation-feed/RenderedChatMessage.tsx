import {
  Attachment,
  AttachmentAction,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "../../shared/ui/ai-elements/attachments.js";
import { Citations } from "../../shared/ui/ai-elements/citation.js";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../../shared/ui/ai-elements/message.js";
import { Reasoning } from "../../shared/ui/ai-elements/reasoning.js";
import { Tool } from "../../shared/ui/ai-elements/tool.js";
import {
  getAssistantMessageView,
  getHostCommandToolStatus,
  toolDisplayNames,
} from "../../domain/message/message-presentation.js";
import type {
  WidgetMessage,
  WidgetMessagePart,
} from "../../domain/message/stream-event-state.js";

export type RenderedChatMessageProps = {
  message: WidgetMessage;
  apiEndpoint: string;
  isStreaming: boolean;
  activeAssistantMessageId?: string;
};

const renderAssistantPart = (
  part: WidgetMessagePart,
  assistantParts: WidgetMessagePart[],
  isActiveAssistant: boolean,
) => {
  if (part.type === "reasoning") {
    return (
      <Reasoning
        isStreaming={isActiveAssistant && part === assistantParts.at(-1)}
        key={part.id}
      >
        {part.content}
      </Reasoning>
    );
  }

  if (part.type === "host-command") {
    return (
      <div className="space-y-2" key={part.id}>
        <Tool
          toolName="host_command"
          displayName="Portfolio table command"
          status={getHostCommandToolStatus(part)}
          input={part.command}
          output={part.result}
          error={
            part.result?.status && part.result.status !== "applied"
              ? part.result.message
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-2" key={part.id}>
      <Tool
        toolName={part.toolName}
        displayName={toolDisplayNames[part.toolName] ?? part.toolName}
        status={part.status}
        input={part.input}
        output={part.output}
        error={part.error}
      />
    </div>
  );
};

export const RenderedChatMessage = ({
  message,
  apiEndpoint,
  isStreaming,
  activeAssistantMessageId,
}: RenderedChatMessageProps) => {
  if (message.role !== "assistant") {
    return (
      <Message from={message.role}>
        <MessageContent data-message-from={message.role}>
          {message.content}
        </MessageContent>
      </Message>
    );
  }

  const view = getAssistantMessageView(message, apiEndpoint);
  const isActiveAssistant = isStreaming && activeAssistantMessageId === message.id;
  const emptyAssistantContent =
    !isActiveAssistant && view.attachments.length > 0 ? (
      <span className="text-muted-foreground">Report ready.</span>
    ) : null;

  return (
    <Message from={message.role}>
      {view.assistantParts.map((part) =>
        renderAssistantPart(part, view.assistantParts, isActiveAssistant),
      )}
      <MessageContent data-message-from={message.role}>
        {view.content ? (
          <>
            <MessageResponse>{view.content}</MessageResponse>
            {view.inlineSources.length > 0 ? (
              <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                <span>Source</span>
                <Citations sources={view.inlineSources} />
              </div>
            ) : null}
          </>
        ) : (
          emptyAssistantContent
        )}
      </MessageContent>
      {view.attachments.length > 0 ? (
        <Attachments className="w-full max-w-2xl">
          {view.attachments.map((attachment) => (
            <Attachment data={attachment} key={attachment.id}>
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentAction />
            </Attachment>
          ))}
        </Attachments>
      ) : null}
    </Message>
  );
};
