import { Message, MessageContent, MessageResponse } from "#shared/ai/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "#shared/ai/reasoning";
import { ChainOfThoughtContent, ChainOfThoughtStep } from "#shared/ai/chain-of-thought";
import { ToolInput, ToolOutput } from "#shared/ai/tool";
import { Badge } from "#shared/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shared/ui/collapsible";
import { cn } from "#shared/lib/cn";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import type { ToolEvent } from "@side-chat/chat-protocol";

import type { HostCommandView, WidgetMessage, WidgetThought } from "#entities/chat";

export const WidgetMessageView = ({ message }: { readonly message: WidgetMessage }) => {
  const showThoughts = shouldShowThoughts(message);

  return (
    <Message from={message.role}>
      <MessageContent>
        {showThoughts && <WidgetThoughts message={message} />}
        {message.content ? (
          <MessageResponse>{message.content}</MessageResponse>
        ) : (
          message.isStreaming &&
          !showThoughts && <p className="text-muted-foreground text-sm">Thinking...</p>
        )}
      </MessageContent>
    </Message>
  );
};

const WidgetThoughts = ({ message }: { readonly message: WidgetMessage }) => {
  const orderedThoughts = toThoughtRows(readMessageThoughts(message), message.isStreaming === true);
  const keepOpen = orderedThoughts.some(
    (thought) => thought.kind === "tool" || thought.kind === "host-command",
  );

  return (
    <Reasoning
      autoClose={!keepOpen}
      defaultOpen={hasThoughtContent(message)}
      isStreaming={message.isStreaming ?? false}
    >
      <ReasoningTrigger />
      <ReasoningContent>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-semibold text-foreground text-lg">Thinking</h3>
        </div>
        <ChainOfThoughtContent>
          {orderedThoughts.map((thought) => (
            <ThoughtRow key={thought.id} thought={thought} />
          ))}
        </ChainOfThoughtContent>
      </ReasoningContent>
    </Reasoning>
  );
};

const shouldShowThoughts = (message: WidgetMessage): boolean =>
  message.role === "assistant" && hasThoughtContent(message);

const hasThoughtContent = (message: WidgetMessage): boolean =>
  message.isStreaming === true ||
  readMessageThoughtCount(message) > 0 ||
  message.reasoning.length > 0 ||
  message.tools.length > 0 ||
  message.hostCommands.length > 0;

type ThoughtRow =
  | {
      readonly id: string;
      readonly kind: "reasoning";
      readonly content: string;
      readonly status: "running" | "completed";
    }
  | {
      readonly id: string;
      readonly kind: "tool";
      readonly tool: ToolEvent;
    }
  | {
      readonly id: string;
      readonly kind: "host-command";
      readonly command: HostCommandView;
    };

const ThoughtRow = ({ thought }: { readonly thought: ThoughtRow }) => {
  switch (thought.kind) {
    case "reasoning":
      const presentation = toThoughtPresentation(thought.content);
      return (
        <ChainOfThoughtStep
          description={
            presentation.body ? (
              <MessageResponse className="text-muted-foreground">
                {presentation.body}
              </MessageResponse>
            ) : undefined
          }
          status={thought.status}
          title={presentation.title}
        />
      );
    case "tool":
      return <ToolThoughtStep tool={thought.tool} />;
    case "host-command":
      return <HostCommandThoughtStep command={thought.command} />;
  }
};

const toThoughtRows = (thoughts: readonly WidgetThought[], isStreaming: boolean): ThoughtRow[] => {
  const rows: ThoughtRow[] = [];
  let modelReasoning = "";
  let modelReasoningIndex = 0;

  const flushModelReasoning = () => {
    const content = normalizeReasoning(modelReasoning);
    if (content.length > 0) {
      rows.push({
        content,
        id: `reasoning-model-${modelReasoningIndex}`,
        kind: "reasoning",
        status: "completed",
      });
      modelReasoningIndex += 1;
      modelReasoning = "";
    }
  };

  for (const thought of [...thoughts].sort((left, right) => left.sequence - right.sequence)) {
    if (thought.kind === "reasoning" && !isToolProgressReasoning(thought.content)) {
      modelReasoning += thought.content;
      continue;
    }

    flushModelReasoning();
    rows.push(toThoughtRow(thought));
  }

  flushModelReasoning();
  return markActiveThoughtRow(rows, isStreaming);
};

const markActiveThoughtRow = (rows: readonly ThoughtRow[], isStreaming: boolean): ThoughtRow[] => {
  if (!isStreaming) return [...rows];
  const activeIndex = rows.findLastIndex(
    (row) => row.kind === "reasoning" || (row.kind === "tool" && row.tool.status === "started"),
  );
  if (activeIndex < 0) return [...rows];

  return rows.map((row, index) =>
    index === activeIndex && row.kind === "reasoning" ? { ...row, status: "running" } : row,
  );
};

const toThoughtRow = (thought: WidgetThought): ThoughtRow => {
  switch (thought.kind) {
    case "reasoning":
      return {
        content: thought.content.trim(),
        id: thought.id,
        kind: "reasoning",
        status: "completed",
      };
    case "tool":
      return {
        id: thought.id,
        kind: "tool",
        tool: thought.tool,
      };
    case "host-command":
      return {
        command: thought.command,
        id: thought.id,
        kind: "host-command",
      };
  }
};

const isToolProgressReasoning = (entry: string): boolean =>
  entry.trim().startsWith("Searching the web") || entry.trim().startsWith("Scanning mocked");

const normalizeReasoning = (reasoning: string): string => reasoning.replace(/\s+/gu, " ").trim();

const toThoughtPresentation = (
  content: string,
): {
  readonly title: string;
  readonly body: string | undefined;
} => {
  const trimmed = content.trim();
  const titledContentMatch = /^\*\*(?<title>[^*]+)\*\*\s*(?<body>.*)$/su.exec(trimmed);
  if (titledContentMatch?.groups) {
    const title = titledContentMatch.groups["title"]?.trim();
    const body = titledContentMatch.groups["body"]?.trim();
    if (title) return { title, body: body || undefined };
  }

  return { title: trimmed, body: undefined };
};

const readMessageThoughts = (message: WidgetMessage): readonly WidgetThought[] => {
  if (readMessageThoughtCount(message) > 0) return message.thoughts;

  return [
    ...message.reasoning.map<WidgetThought>((content, index) => ({
      content,
      id: `reasoning-${index}`,
      kind: "reasoning",
      sequence: index,
    })),
    ...message.tools.map<WidgetThought>((tool) => ({
      id: tool.toolCallId,
      kind: "tool",
      sequence: tool.sequence,
      tool,
    })),
    ...message.hostCommands.map<WidgetThought>((command) => ({
      command,
      id: command.event.commandId,
      kind: "host-command",
      sequence: command.event.sequence,
    })),
  ];
};

const readMessageThoughtCount = (message: WidgetMessage): number => message.thoughts?.length ?? 0;

const ToolThoughtStep = ({ tool }: { readonly tool: ToolEvent }) => (
  <Collapsible className="group/tool grid grid-cols-[1rem_1fr] gap-x-3 text-sm">
    <div className="flex flex-col items-center pt-0.5">
      <SearchIcon className={cn("size-4", toToolIconClassName(tool.status))} />
      <span className="mt-2 h-full min-h-4 w-px bg-border" />
    </div>
    <div className="space-y-2 pb-1">
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
        <span className="font-medium text-muted-foreground group-data-[state=open]/tool:text-foreground">
          {tool.status === "started" ? `Running ${tool.toolName}` : tool.toolName}
        </span>
        <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
      </CollapsibleTrigger>
      {toolSources(tool).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {toolSources(tool).map((source) => (
            <Badge key={source} variant="secondary">
              {source}
            </Badge>
          ))}
        </div>
      )}
      <CollapsibleContent className="space-y-3">
        <ToolInput input={tool.input ?? {}} />
        <ToolOutput
          errorText={tool.errorCode}
          output={tool.status === "started" ? undefined : tool.result}
        />
      </CollapsibleContent>
    </div>
  </Collapsible>
);

const HostCommandThoughtStep = ({ command }: { readonly command: HostCommandView }) => (
  <ChainOfThoughtStep
    status={command.status === "failed" ? "failed" : toThoughtStatus(command.status)}
    title={command.event.commandName}
  >
    <p className={cn("text-sm", command.status === "failed" && "text-destructive")}>
      {command.event.commandName}: {command.result?.status ?? command.status}
    </p>
  </ChainOfThoughtStep>
);

const toThoughtStatus = (status: ToolEvent["status"] | "running" | "completed" | "failed") => {
  if (status === "started" || status === "running") return "running";
  if (status === "failed") return "failed";
  return "completed";
};

const toToolIconClassName = (status: ToolEvent["status"]): string => {
  if (status === "failed") return "text-destructive";
  return "text-foreground";
};

const toolSources = (tool: ToolEvent): string[] => {
  const results = tool.result?.["results"];
  if (!Array.isArray(results)) return [];

  return results
    .map((result) => (isRecord(result) && typeof result["url"] === "string" ? result["url"] : ""))
    .filter(Boolean)
    .map((url) => new URL(url).hostname);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
