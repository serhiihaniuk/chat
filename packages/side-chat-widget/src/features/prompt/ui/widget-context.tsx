import { PromptInputButton } from "#shared/ai/prompt-input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#shared/ui/hover-card";
import { FileTextIcon } from "lucide-react";

import type { WidgetMessage, WidgetUsage } from "#entities/chat";

const recentChatMessageLimit = 12;
const recentChatMessageCharacters = 1200;
const recentChatTotalCharacters = 6000;

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

export const getVisibleChatCharacters = (messages: readonly WidgetMessage[]): number => {
  const formattedLength = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-recentChatMessageLimit)
    .reduce((total, message) => {
      const normalized = message.content.replace(/\s+/g, " ").trim();
      return (
        total + message.role.length + 2 + Math.min(normalized.length, recentChatMessageCharacters)
      );
    }, 0);

  return Math.min(formattedLength, recentChatTotalCharacters);
};

export const WidgetContextTools = ({
  messages,
  usage,
}: {
  readonly messages: readonly WidgetMessage[];
  readonly usage: WidgetUsage | undefined;
}) => <ChatSizeControl usedCharacters={getVisibleChatCharacters(messages)} usage={usage} />;

const ChatSizeControl = ({
  usedCharacters,
  usage,
}: {
  readonly usedCharacters: number;
  readonly usage: WidgetUsage | undefined;
}) => {
  const estimatedTokens = estimateTokens(usedCharacters);

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger
        render={
          <PromptInputButton
            aria-label="Chat size estimate"
            className="gap-1.5 px-1.5 text-muted-foreground"
          />
        }
      >
        <FileTextIcon aria-hidden="true" className="size-4" />
        <span>Chat size</span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-96 max-w-[calc(100vw-3rem)] rounded-md border border-border p-3 shadow-xl"
        side="top"
        sideOffset={8}
      >
        <span className="flex items-center justify-between gap-3">
          <strong className="font-medium text-foreground text-sm">Chat size estimate</strong>
          <span className="font-medium text-muted-foreground">
            ~{compactNumber.format(estimatedTokens)} tokens
          </span>
        </span>
        <ChatSizeRows
          estimatedTokens={estimatedTokens}
          usedCharacters={usedCharacters}
          usage={usage}
        />
        <span className="mt-3 block rounded bg-muted px-2 py-1.5 text-muted-foreground text-xs">
          Local estimate only. This is not the selected model's context window; the service applies
          backend context budgets before each model call.
        </span>
      </HoverCardContent>
    </HoverCard>
  );
};

const ChatSizeRows = ({
  estimatedTokens,
  usedCharacters,
  usage,
}: {
  readonly estimatedTokens: number;
  readonly usedCharacters: number;
  readonly usage: WidgetUsage | undefined;
}) => (
  <span className="mt-3 grid gap-2">
    <ContextRow
      label="Recent visible text"
      value={`${compactNumber.format(usedCharacters)} chars`}
    />
    <ContextRow
      label="Approx. visible tokens"
      value={`~${compactNumber.format(estimatedTokens)}`}
    />
    <ContextRow
      label="Last turn tokens"
      value={usage ? `${compactNumber.format(usage.totalTokens ?? 0)} total` : "-"}
    />
    <ContextRow
      label="Input / output"
      value={
        usage
          ? `${compactNumber.format(usage.inputTokens ?? 0)} / ${compactNumber.format(
              usage.outputTokens ?? 0,
            )}`
          : "-"
      }
    />
  </span>
);

const ContextRow = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <span className="flex items-center justify-between gap-3">
    <span>{label}</span>
    <span className="font-medium text-foreground">{value}</span>
  </span>
);

const estimateTokens = (characters: number): number => Math.max(0, Math.ceil(characters / 4));
