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
import { BrainCircuitIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useCallback } from "react";

import { ComposerActions } from "./composer-actions.js";
import { WidgetContextTools } from "./widget-context.js";
import type { WidgetMessage, WidgetStatus, WidgetUsage } from "#entities/chat";
import type { ChatReasoningEffort } from "@side-chat/chat-protocol";

type WidgetFooterLabels = {
  readonly placeholder: string;
  readonly send: string;
};

type WidgetFooterModel = {
  readonly key: string;
  readonly label: string;
};

export const WidgetFooter = ({
  isBusy,
  labels,
  messages,
  onSubmitMessage,
  models,
  onModelSelect,
  onReasoningEffortSelect,
  reasoningEfforts,
  selectedModelKey,
  selectedModelLabel,
  selectedReasoningEffort,
  status,
  stop,
  usage,
}: {
  readonly isBusy: boolean;
  readonly labels: WidgetFooterLabels;
  readonly messages: readonly WidgetMessage[];
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly models: readonly WidgetFooterModel[];
  readonly onModelSelect: (modelKey: string) => void;
  readonly onReasoningEffortSelect: (effort: ChatReasoningEffort) => void;
  readonly reasoningEfforts: readonly ChatReasoningEffort[];
  readonly selectedModelKey: string | undefined;
  readonly selectedModelLabel: string | undefined;
  readonly selectedReasoningEffort: ChatReasoningEffort | undefined;
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
            {reasoningEfforts.length > 1 && selectedReasoningEffort && (
              <PromptReasoningSelector
                efforts={reasoningEfforts}
                onSelect={onReasoningEffortSelect}
                selectedEffort={selectedReasoningEffort}
              />
            )}
            {models.length > 0 && (
              <PromptModelSelector
                models={models}
                onSelect={onModelSelect}
                selectedModelKey={selectedModelKey}
                selectedModelLabel={selectedModelLabel}
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
  models,
  onSelect,
  selectedModelKey,
  selectedModelLabel,
}: {
  readonly models: readonly WidgetFooterModel[];
  readonly onSelect: (modelKey: string) => void;
  readonly selectedModelKey: string | undefined;
  readonly selectedModelLabel: string | undefined;
}) => (
  <ModelSelector>
    <ModelSelectorTrigger
      render={<Button aria-label="Select model" size="sm" type="button" variant="ghost" />}
    >
      <span className="max-w-28 truncate">{selectedModelLabel ?? "Model"}</span>
      <ChevronsUpDownIcon className="size-3.5" />
    </ModelSelectorTrigger>
    <ModelSelectorContent>
      <ModelSelectorInput placeholder="Search models..." />
      <ModelSelectorList>
        <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
        <ModelSelectorGroup>
          {models.map((model) => (
            <ModelSelectorItem
              key={model.key}
              onSelect={() => onSelect(model.key)}
              value={`${model.label} ${model.key}`}
            >
              <ModelSelectorName>{model.label}</ModelSelectorName>
              {model.key === selectedModelKey && <CheckIcon className="size-4" />}
            </ModelSelectorItem>
          ))}
        </ModelSelectorGroup>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector>
);

const PromptReasoningSelector = ({
  efforts,
  onSelect,
  selectedEffort,
}: {
  readonly efforts: readonly ChatReasoningEffort[];
  readonly onSelect: (effort: ChatReasoningEffort) => void;
  readonly selectedEffort: ChatReasoningEffort;
}) => (
  <ModelSelector>
    <ModelSelectorTrigger
      render={
        <Button aria-label="Select reasoning effort" size="sm" type="button" variant="ghost" />
      }
    >
      <BrainCircuitIcon className="size-3.5" />
      <span className="max-w-20 truncate">{formatReasoningEffort(selectedEffort)}</span>
      <ChevronsUpDownIcon className="size-3.5" />
    </ModelSelectorTrigger>
    <ModelSelectorContent title="Reasoning Effort">
      <ModelSelectorList>
        <ModelSelectorGroup>
          {efforts.map((effort) => (
            <ModelSelectorItem key={effort} onSelect={() => onSelect(effort)} value={effort}>
              <ModelSelectorName>{formatReasoningEffort(effort)}</ModelSelectorName>
              {effort === selectedEffort && <CheckIcon className="size-4" />}
            </ModelSelectorItem>
          ))}
        </ModelSelectorGroup>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector>
);

const formatReasoningEffort = (effort: ChatReasoningEffort): string =>
  effort === "xhigh" ? "X-high" : `${effort[0]?.toUpperCase()}${effort.slice(1)}`;

const toPromptStatusProps = (
  status: WidgetStatus,
): { readonly status?: "submitted" | "streaming" } => {
  if (status === "submitted") return { status: "submitted" };
  if (status === "streaming") return { status: "streaming" };
  return {};
};
