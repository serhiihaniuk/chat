import type { ReactElement } from "react";

import { AttachmentList } from "./attachment-list.js";
import { CitationList } from "./citation-list.js";
import { HostCommandPart } from "./host-command-part.js";
import { ReasoningPart } from "./reasoning-part.js";
import { ToolPart } from "./tool-part.js";
import { getAssistantMessageView } from "../model/message-view.js";
import type { WidgetMessage } from "#entities/message/model";
import { Response } from "#shared/ai/response";

export type AssistantMessageProps = {
  readonly message: WidgetMessage;
};

export const AssistantMessage = ({
  message,
}: AssistantMessageProps): ReactElement => {
  const view = getAssistantMessageView(message);

  return (
    <div className="min-w-0 space-y-3">
      {view.reasoningParts.map((part) =>
        part.type === "reasoning" ? (
          <ReasoningPart
            className="ml-0"
            key={part.id}
            summary={part.content}
          />
        ) : null,
      )}
      {view.toolParts.map((part) => (
        <ToolPart className="ml-0" key={part.id} tool={part} />
      ))}
      {view.hostCommandParts.map((part) => (
        <HostCommandPart className="ml-0" commandPart={part} key={part.id} />
      ))}
      {view.content ? (
        <Response className="max-w-full">{view.content}</Response>
      ) : null}
      <CitationList sources={view.sources} />
      <AttachmentList attachments={view.attachments} />
    </div>
  );
};
