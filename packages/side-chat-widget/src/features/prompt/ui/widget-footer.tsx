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
import { Button } from "#shared/ui/button";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback } from "react";

import { ComposerActions } from "./composer-actions.js";
import { WidgetContextTools } from "./widget-context.js";
import type { WidgetMessage, WidgetStatus, WidgetUsage } from "#entities/chat";

type WidgetFooterLabels = {
  readonly placeholder: string;
  readonly send: string;
};

type WidgetFooterAssistantProfile = {
  readonly id: string;
  readonly label: string;
};

export const WidgetFooter = ({
  isBusy,
  labels,
  messages,
  onSubmitMessage,
  onProfileSelect,
  profiles,
  selectedProfileId,
  selectedProfileLabel,
  status,
  stop,
  usage,
}: {
  readonly isBusy: boolean;
  readonly labels: WidgetFooterLabels;
  readonly messages: readonly WidgetMessage[];
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly onProfileSelect: (profileId: string) => void;
  readonly profiles: readonly WidgetFooterAssistantProfile[];
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
    <footer className="shrink-0 px-4 pt-2 pb-4">
      <PromptInput className="group mx-auto w-full max-w-[44.5rem]" onSubmit={submitMessage}>
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message"
            className="min-h-12 py-3 text-[0.9375rem]"
            disabled={isBusy}
            placeholder={labels.placeholder}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <ComposerActions />
          </PromptInputTools>
          <div className="flex min-w-0 items-center gap-1">
            <WidgetContextTools messages={messages} usage={usage} />
            {profiles.length > 0 && (
              <PromptModelSelector
                onSelect={onProfileSelect}
                profiles={profiles}
                selectedProfileId={selectedProfileId}
                selectedProfileLabel={selectedProfileLabel}
              />
            )}
            <PromptInputSubmit
              aria-label={labels.send}
              // Idle composer: the send button reads as disarmed (muted) until the
              // textarea has text; while generating it keeps its armed/stop styling.
              className={
                status === "idle"
                  ? "group-has-[textarea:placeholder-shown]:bg-muted group-has-[textarea:placeholder-shown]:text-muted-foreground group-has-[textarea:placeholder-shown]:shadow-none"
                  : undefined
              }
              onStop={stop}
              {...toPromptStatusProps(status)}
            />
          </div>
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
  readonly profiles: readonly WidgetFooterAssistantProfile[];
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

const toPromptStatusProps = (
  status: WidgetStatus,
): { readonly status?: "submitted" | "streaming" } => {
  if (status === "submitted") return { status: "submitted" };
  if (status === "streaming") return { status: "streaming" };
  return {};
};
