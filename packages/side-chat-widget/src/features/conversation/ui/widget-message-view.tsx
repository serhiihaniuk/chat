import {
  ChainOfThoughtImage,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "#shared/ai/chain-of-thought";
import { Message, MessageContent, MessageResponse } from "#shared/ai/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "#shared/ai/reasoning";
import { ToolInput, ToolOutput } from "#shared/ai/tool";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shared/ui/collapsible";
import {
  BrainIcon,
  ChevronDownIcon,
  CommandIcon,
  SearchIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import type { WidgetActivityItem, WidgetMessage } from "#entities/chat";
import { readActivitySourceLabel, ToolActivityDetails } from "./widget-tool-activity-details.js";

export const WidgetMessageView = ({ message }: { readonly message: WidgetMessage }) => {
  const showActivity = shouldShowActivity(message);

  return (
    <Message from={message.role}>
      <MessageContent>
        {showActivity && <WidgetActivityTimeline message={message} />}
        {message.content ? (
          <MessageResponse
            isAnimating={message.role === "assistant" && message.isStreaming === true}
          >
            {message.content}
          </MessageResponse>
        ) : (
          message.isStreaming &&
          !showActivity && <p className="text-muted-foreground text-sm">Thinking...</p>
        )}
      </MessageContent>
    </Message>
  );
};

const WidgetActivityTimeline = ({ message }: { readonly message: WidgetMessage }) => {
  const duration = readActivityDuration(message);

  return (
    <Reasoning
      autoClose
      defaultOpen={message.isStreaming === true}
      isStreaming={message.isStreaming ?? false}
      {...(duration !== undefined ? { duration } : {})}
    >
      <ReasoningTrigger />
      <ReasoningContent>
        <ChainOfThoughtContent>
          {message.activity.items.map((item) => (
            <ActivityRow
              isActive={message.activity.activeItemId === item.id}
              item={item}
              key={item.id}
            />
          ))}
        </ChainOfThoughtContent>
      </ReasoningContent>
    </Reasoning>
  );
};

const ActivityRow = ({
  isActive,
  item,
}: {
  readonly isActive: boolean;
  readonly item: WidgetActivityItem;
}) => {
  const displayStatus = toActivityDisplayStatus(item, isActive);
  if (item.kind === "tool") return <ToolActivityStep displayStatus={displayStatus} item={item} />;
  if (item.kind === "host_command") {
    return <HostCommandActivityStep displayStatus={displayStatus} item={item} />;
  }

  return (
    <ChainOfThoughtStep
      description={item.body ? <MessageResponse>{item.body}</MessageResponse> : undefined}
      icon={activityIcon(item)}
      sources={item.details?.sources?.map(readActivitySourceLabel) ?? []}
      status={displayStatus}
      title={item.title}
    >
      <ActivityImages item={item} />
    </ChainOfThoughtStep>
  );
};

const ToolActivityStep = ({
  displayStatus,
  item,
}: {
  readonly displayStatus: ChainOfThoughtStepStatus;
  readonly item: WidgetActivityItem;
}) => {
  const tool = item.details?.tool;
  const sources = tool?.sources ?? item.details?.sources ?? [];

  return (
    <Collapsible className="group/tool" defaultOpen>
      <ChainOfThoughtStep
        icon={WrenchIcon}
        status={displayStatus}
        title={
          <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-wide group-data-[state=open]/tool:text-foreground">
              {readToolActionLabel(item, displayStatus)}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent className="space-y-3">
          <ToolActivityDetails item={item} sources={sources} />
        </CollapsibleContent>
      </ChainOfThoughtStep>
    </Collapsible>
  );
};

const HostCommandActivityStep = ({
  displayStatus,
  item,
}: {
  readonly displayStatus: ChainOfThoughtStepStatus;
  readonly item: WidgetActivityItem;
}) => {
  const hostCommand = item.details?.hostCommand;
  return (
    <ChainOfThoughtStep
      description={item.body ? <MessageResponse>{item.body}</MessageResponse> : undefined}
      icon={CommandIcon}
      status={displayStatus}
      title={item.title}
    >
      {hostCommand && (
        <div className="space-y-3">
          <ToolInput input={hostCommand.payload} />
          <ToolOutput
            output={hostCommand.result}
            {...(item.status === "failed" ? { errorText: "host_command_failed" } : {})}
          />
        </div>
      )}
    </ChainOfThoughtStep>
  );
};

const ActivityImages = ({ item }: { readonly item: WidgetActivityItem }) => {
  const images = item.details?.images ?? [];
  if (images.length === 0) return null;

  return images.map((image) => (
    <ChainOfThoughtImage caption={image.caption} key={`${image.mediaType}:${image.alt}`}>
      <img
        alt={image.alt}
        className="aspect-square h-[150px] rounded-md border object-cover"
        src={`data:${image.mediaType};base64,${image.data}`}
      />
    </ChainOfThoughtImage>
  ));
};

const shouldShowActivity = (message: WidgetMessage): boolean =>
  message.role === "assistant" &&
  (message.isStreaming === true || message.activity.items.length > 0);

const activityIcon = (item: WidgetActivityItem): LucideIcon => {
  if (item.kind === "progress") return SearchIcon;
  return BrainIcon;
};

type ChainOfThoughtStepStatus = "running" | "completed" | "failed";

const toActivityDisplayStatus = (
  item: WidgetActivityItem,
  isActive: boolean,
): ChainOfThoughtStepStatus => {
  if (item.status === "running" && !isActive) return "completed";
  return toStepStatus(item.status);
};

const toStepStatus = (status: WidgetActivityItem["status"]): ChainOfThoughtStepStatus => {
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "completed";
};

const readToolActionLabel = (
  item: WidgetActivityItem,
  displayStatus: ChainOfThoughtStepStatus,
): string => {
  const tool = item.details?.tool;
  if (displayStatus === "running") return "Running";
  if (item.status === "failed" || tool?.errorCode) return "View error";
  if (tool?.result) return "View result";
  return "View details";
};

const readActivityDuration = (message: WidgetMessage): number | undefined => {
  const { completedAt, startedAt } = message.activity;
  if (!completedAt || !startedAt) return undefined;

  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;

  return Math.max(1, Math.ceil((completed - started) / 1000));
};
