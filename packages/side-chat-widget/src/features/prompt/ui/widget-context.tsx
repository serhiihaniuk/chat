import { PromptInputButton } from "#shared/ai/prompt-input";
import { cn } from "#shared/lib/cn";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#shared/ui/hover-card";
import { PanelTopIcon } from "lucide-react";

import type { WidgetMessage, WidgetUsage } from "#entities/chat";

const recentContextMessageLimit = 12;
const recentContextMessageCharacters = 1200;
const recentContextTotalCharacters = 6000;

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

export const getVisibleContextCharacters = (messages: readonly WidgetMessage[]): number => {
  const formattedLength = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-recentContextMessageLimit)
    .reduce((total, message) => {
      const normalized = message.content.replace(/\s+/g, " ").trim();
      return (
        total +
        message.role.length +
        2 +
        Math.min(normalized.length, recentContextMessageCharacters)
      );
    }, 0);

  return Math.min(formattedLength, recentContextTotalCharacters);
};

export const WidgetContextTools = ({
  messages,
  usage,
}: {
  readonly messages: readonly WidgetMessage[];
  readonly usage: WidgetUsage | undefined;
}) => (
  <>
    <ContextUsageControl usedCharacters={getVisibleContextCharacters(messages)} usage={usage} />
    <PageContextIndicator />
  </>
);

const ContextUsageControl = ({
  usedCharacters,
  usage,
}: {
  readonly usedCharacters: number;
  readonly usage: WidgetUsage | undefined;
}) => {
  const percent = Math.min(100, Math.round((usedCharacters / recentContextTotalCharacters) * 100));

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger
        className="max-sm:hidden"
        render={<PromptInputButton aria-label={`Context usage ${percent}%`} />}
      >
        <span>Context</span>
        <span>{percent}%</span>
        <ContextRing percent={percent} />
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-96 max-w-[calc(100vw-3rem)] rounded-md border border-border p-3 shadow-xl"
        side="top"
        sideOffset={8}
      >
        <span className="flex items-center justify-between gap-3">
          <strong className="font-medium text-foreground text-sm">Context usage</strong>
          <span className="font-medium text-muted-foreground">{percent}%</span>
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-foreground"
            style={{ width: `${percent}%` }}
          />
        </span>
        <ContextUsageRows usedCharacters={usedCharacters} usage={usage} />
        <span className="mt-3 block rounded bg-muted px-2 py-1.5 text-muted-foreground text-xs">
          Visible conversation context is trimmed to the last 12 messages and 6k characters.
        </span>
      </HoverCardContent>
    </HoverCard>
  );
};

const ContextRing = ({ percent }: { readonly percent: number }) => {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <svg aria-hidden="true" className="size-4 -rotate-90" viewBox="0 0 20 20">
      <circle
        cx="10"
        cy="10"
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <circle
        cx="10"
        cy="10"
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
};

const ContextUsageRows = ({
  usedCharacters,
  usage,
}: {
  readonly usedCharacters: number;
  readonly usage: WidgetUsage | undefined;
}) => (
  <span className="mt-3 grid gap-2">
    <ContextRow
      label="Visible context"
      value={`${compactNumber.format(usedCharacters)} / ${compactNumber.format(
        recentContextTotalCharacters,
      )} chars`}
    />
    <ContextRow
      label="Approx. context tokens"
      value={`${compactNumber.format(
        estimateTokens(usedCharacters),
      )} / ${compactNumber.format(estimateTokens(recentContextTotalCharacters))}`}
    />
    <ContextRow
      label="Conversation usage"
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

const PageContextIndicator = () => (
  <HoverCard closeDelay={100} openDelay={100}>
    <HoverCardTrigger
      className="shrink-0 max-sm:hidden"
      render={<PromptInputButton aria-label="Using current page context" className="gap-1.5" />}
    >
      <PanelTopIcon className="size-4" />
      <span>Page</span>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" />
    </HoverCardTrigger>
    <HoverCardContent
      align="start"
      className={cn("w-80 max-w-[calc(100vw-3rem)] rounded-md border border-border p-3 shadow-xl")}
      side="top"
      sideOffset={8}
    >
      <strong className="block font-medium text-foreground text-sm">Page context</strong>
      <span className="mt-2 block leading-5 text-muted-foreground">
        The assistant can use the current workspace surface, visible page state, active filters, and
        selected host context.
      </span>
      <span className="mt-2 block rounded bg-muted p-2 text-muted-foreground text-xs leading-5">
        It does not automatically inspect other pages or hidden browser state.
      </span>
    </HoverCardContent>
  </HoverCard>
);

const estimateTokens = (characters: number): number => Math.max(0, Math.ceil(characters / 4));
