import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "#shared/ai/model-selector";
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
import { Button } from "#shared/ui/button";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback } from "react";

import { WidgetContextTools } from "./widget-context.js";
import { toPromptStatusProps } from "./widget-state.js";
import type {
  SideChatWidgetAssistantProfile,
  SideChatWidgetLabels,
  SideChatWidgetQuickAction,
  WidgetMessage,
  WidgetStatus,
  WidgetUsage,
} from "./widget.types.js";

export const WidgetFooter = ({
  isBusy,
  labels,
  messageCount,
  messages,
  onSubmitMessage,
  onProfileSelect,
  profiles,
  quickActions,
  selectedProfileId,
  selectedProfileLabel,
  status,
  stop,
  usage,
}: {
  readonly isBusy: boolean;
  readonly labels: Required<SideChatWidgetLabels>;
  readonly messageCount: number;
  readonly messages: readonly WidgetMessage[];
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly onProfileSelect: (profileId: string) => void;
  readonly profiles: readonly SideChatWidgetAssistantProfile[];
  readonly quickActions: readonly SideChatWidgetQuickAction[];
  readonly selectedProfileId: string | undefined;
  readonly selectedProfileLabel: string | undefined;
  readonly status: WidgetStatus;
  readonly stop: () => void;
  readonly usage: WidgetUsage | undefined;
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
          <PromptInputTools>
            <WidgetContextTools messages={messages} usage={usage} />
            {profiles.length > 0 && (
              <PromptModelSelector
                onSelect={onProfileSelect}
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                selectedProfileLabel={selectedProfileLabel}
              />
            )}
          </PromptInputTools>
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

const PromptModelSelector = ({
  onSelect,
  profiles,
  selectedProfileId,
  selectedProfileLabel,
}: {
  readonly onSelect: (profileId: string) => void;
  readonly profiles: readonly SideChatWidgetAssistantProfile[];
  readonly selectedProfileId: string | undefined;
  readonly selectedProfileLabel: string | undefined;
}) => (
  <ModelSelector>
    <ModelSelectorTrigger
      render={<Button aria-label="Select model" size="sm" type="button" variant="ghost" />}
    >
      <span className="max-w-32 truncate">{selectedProfileLabel ?? "Model"}</span>
      <ChevronsUpDownIcon className="size-3.5" />
    </ModelSelectorTrigger>
    <ModelSelectorContent>
      <ModelSelectorInput placeholder="Search models..." />
      <ModelSelectorList>
        <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
        <ModelSelectorGroup>
          {profiles.map((profile) => (
            <ModelSelectorItem
              key={profile.id}
              onSelect={() => onSelect(profile.id)}
              value={`${profile.label} ${profile.id}`}
            >
              <ModelSelectorName>{profile.label}</ModelSelectorName>
              {profile.id === selectedProfileId && <CheckIcon className="size-4" />}
            </ModelSelectorItem>
          ))}
        </ModelSelectorGroup>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector>
);

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
