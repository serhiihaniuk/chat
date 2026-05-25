import {
  PromptInput,
  type PromptInputMessage,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "#shared/ai/prompt-input";
import { Suggestion, Suggestions } from "#shared/ai/suggestion";
import { useCallback } from "react";

import { toPromptStatusProps } from "./widget-state.js";
import type {
  SideChatWidgetLabels,
  SideChatWidgetQuickAction,
  WidgetStatus,
} from "./widget.types.js";

export const WidgetFooter = ({
  isBusy,
  labels,
  messageCount,
  onSubmitMessage,
  quickActions,
  status,
  stop,
}: {
  readonly isBusy: boolean;
  readonly labels: Required<SideChatWidgetLabels>;
  readonly messageCount: number;
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly quickActions: readonly SideChatWidgetQuickAction[];
  readonly status: WidgetStatus;
  readonly stop: () => void;
}) => {
  const submitMessage = useCallback(
    (message: PromptInputMessage) => {
      void onSubmitMessage(message.text);
    },
    [onSubmitMessage],
  );

  return (
    <footer className="shrink-0 border-t border-border p-3">
      <QuickActions
        messageCount={messageCount}
        onSubmitMessage={onSubmitMessage}
        quickActions={quickActions}
      />
      <PromptInput className="w-full" onSubmit={submitMessage}>
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message"
            disabled={isBusy}
            placeholder={labels.placeholder}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            aria-label={labels.send}
            onStop={stop}
            {...toPromptStatusProps(status)}
          />
        </PromptInputFooter>
      </PromptInput>
    </footer>
  );
};

const QuickActions = ({
  messageCount,
  onSubmitMessage,
  quickActions,
}: {
  readonly messageCount: number;
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly quickActions: readonly SideChatWidgetQuickAction[];
}) => {
  if (quickActions.length === 0 || messageCount > 0) return null;

  return (
    <Suggestions className="mb-3">
      {quickActions.map((action) => (
        <Suggestion
          key={action.id}
          onClick={() => void onSubmitMessage(action.prompt)}
          suggestion={action.prompt}
        >
          {action.label}
        </Suggestion>
      ))}
    </Suggestions>
  );
};
