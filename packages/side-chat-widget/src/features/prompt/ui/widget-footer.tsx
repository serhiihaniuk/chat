import { BrainCircuitIcon, GaugeIcon, SparklesIcon, type LucideIcon } from "lucide-react";

import type { WidgetStatus } from "#entities/chat";
import { Composer } from "#shared/ui/composer";
import { ModelSelector, type Model, type ThinkingLevel } from "#shared/ui/model-selector";
import { ToolsMenu, type ToolMenuItem } from "#shared/ui/tools-menu";
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
  contextUsedTokens,
  contextWindowTokens,
  labels,
  models,
  onModelSelect,
  onReasoningEffortSelect,
  onSubmitMessage,
  onToggleTool,
  reasoningEfforts,
  selectedModelKey,
  selectedReasoningEffort,
  sendOnEnter,
  status,
  stop,
  tools,
}: {
  // Real context fill: tokens used by the last completed turn against the active
  // model's window. Both undefined until a turn completes, so the meter stays hidden.
  readonly contextUsedTokens: number | undefined;
  readonly contextWindowTokens: number | undefined;
  readonly labels: WidgetFooterLabels;
  readonly models: readonly WidgetFooterModel[];
  readonly onModelSelect: (modelKey: string) => void;
  readonly onReasoningEffortSelect: (effort: ChatReasoningEffort) => void;
  readonly onSubmitMessage: (messageText: string) => Promise<void>;
  readonly onToggleTool: (name: string) => void;
  readonly reasoningEfforts: readonly ChatReasoningEffort[];
  readonly selectedModelKey: string | undefined;
  readonly selectedReasoningEffort: ChatReasoningEffort | undefined;
  readonly sendOnEnter: boolean;
  readonly status: WidgetStatus;
  readonly stop: () => void;
  readonly tools: readonly ToolMenuItem[];
}) => (
  <footer className="shrink-0 px-3 pb-3">
    <Composer
      className="mx-auto w-full max-w-measure-message"
      contextUsedTokens={contextUsedTokens}
      contextWindowTokens={contextWindowTokens}
      modelSelector={
        models.length > 0 ? (
          <PromptModelSelector
            models={models}
            onModelSelect={onModelSelect}
            onReasoningEffortSelect={onReasoningEffortSelect}
            reasoningEfforts={reasoningEfforts}
            selectedModelKey={selectedModelKey}
            selectedReasoningEffort={selectedReasoningEffort}
          />
        ) : null
      }
      onStop={stop}
      onSubmit={onSubmitMessage}
      placeholder={labels.placeholder}
      sendLabel={labels.send}
      sendOnEnter={sendOnEnter}
      status={status}
      toolsMenu={tools.length > 0 ? <ToolsMenu tools={tools} onToggleTool={onToggleTool} /> : null}
    />
  </footer>
);

const PromptModelSelector = ({
  models,
  onModelSelect,
  onReasoningEffortSelect,
  reasoningEfforts,
  selectedModelKey,
  selectedReasoningEffort,
}: {
  readonly models: readonly WidgetFooterModel[];
  readonly onModelSelect: (modelKey: string) => void;
  readonly onReasoningEffortSelect: (effort: ChatReasoningEffort) => void;
  readonly reasoningEfforts: readonly ChatReasoningEffort[];
  readonly selectedModelKey: string | undefined;
  readonly selectedReasoningEffort: ChatReasoningEffort | undefined;
}) => (
  <ModelSelector
    models={models.map(toModelSelectorModel)}
    onThinkingChange={(effortId) => {
      const effort = reasoningEfforts.find((candidate) => candidate === effortId);
      if (effort) onReasoningEffortSelect(effort);
    }}
    onValueChange={onModelSelect}
    thinkingLevels={toThinkingLevels(reasoningEfforts)}
    thinkingValue={selectedReasoningEffort}
    value={selectedModelKey}
  />
);

const toModelSelectorModel = (model: WidgetFooterModel): Model => ({
  id: model.key,
  name: model.label,
  desc: model.key,
  icon: <SparklesIcon className="size-4" />,
});

const toThinkingLevels = (efforts: readonly ChatReasoningEffort[]): readonly ThinkingLevel[] =>
  efforts.map((effort) => ({
    id: effort,
    label: formatReasoningEffort(effort),
    desc: describeReasoningEffort(effort),
    Icon: iconForReasoningEffort(effort),
  }));

const iconForReasoningEffort = (effort: ChatReasoningEffort): LucideIcon => {
  if (effort === "high") return BrainCircuitIcon;
  if (effort === "medium") return GaugeIcon;
  return SparklesIcon;
};

const describeReasoningEffort = (effort: ChatReasoningEffort): string => {
  if (effort === "low") return "Light reasoning";
  if (effort === "medium") return "Balanced reasoning";
  return "Deeper reasoning";
};

const formatReasoningEffort = (effort: ChatReasoningEffort): string =>
  `${effort[0]?.toUpperCase()}${effort.slice(1)}`;
