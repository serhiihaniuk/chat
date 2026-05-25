import { Message, MessageContent, MessageResponse } from "#shared/ai/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "#shared/ai/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "#shared/ai/tool";
import { cn } from "#shared/lib/cn";
import type { ToolEvent } from "@side-chat/chat-protocol";

import type { WidgetMessage } from "./widget.types.js";

export const WidgetMessageView = ({ message }: { readonly message: WidgetMessage }) => {
  const reasoningText = message.reasoning.join("");
  const showReasoning =
    message.role === "assistant" && (message.isStreaming === true || reasoningText.length > 0);

  return (
    <Message from={message.role}>
      <MessageContent>
        {showReasoning && (
          <Reasoning isStreaming={message.isStreaming ?? false}>
            <ReasoningTrigger />
            {reasoningText.length > 0 && <ReasoningContent>{reasoningText}</ReasoningContent>}
          </Reasoning>
        )}
        {message.content ? (
          <MessageResponse>{message.content}</MessageResponse>
        ) : (
          message.isStreaming &&
          !showReasoning && <p className="text-muted-foreground text-sm">Thinking...</p>
        )}
        {message.tools.map((tool) => (
          <Tool defaultOpen key={tool.toolCallId}>
            <ToolHeader
              state={toToolState(tool.status)}
              toolName={tool.toolName}
              type="dynamic-tool"
            />
            <ToolContent>
              <ToolInput input={{}} />
              <ToolOutput errorText={tool.errorCode} output={tool.result ?? tool.status} />
            </ToolContent>
          </Tool>
        ))}
        {message.hostCommands.map((command) => (
          <Tool defaultOpen key={command.event.commandId}>
            <ToolHeader
              state={command.status === "failed" ? "output-error" : "output-available"}
              toolName={command.event.commandName}
              type="dynamic-tool"
            />
            <ToolContent>
              <p className={cn("text-sm", command.status === "failed" && "text-destructive")}>
                {command.event.commandName}: {command.result?.status ?? command.status}
              </p>
            </ToolContent>
          </Tool>
        ))}
      </MessageContent>
    </Message>
  );
};

const toToolState = (status: ToolEvent["status"]) => {
  if (status === "started") return "input-available";
  if (status === "failed") return "output-error";
  return "output-available";
};
