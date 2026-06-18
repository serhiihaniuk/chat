import { useState, type ReactElement } from "react";

import { Combobox } from "@base-ui/react/combobox";
import {
  Brain,
  Check,
  ChevronDown,
  Gauge,
  Globe,
  Search,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

import { Media } from "#shared/ui/media";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";
import { usePortalContainer } from "#shared/ui/widget-root";

export type Model = {
  readonly desc: string;
  readonly icon: ReactElement;
  readonly id: string;
  readonly name: string;
};

export type ThinkingLevel = SegmentedItem & {
  readonly desc: string;
};

type ModelSelectorProps = {
  readonly defaultModel?: Model | undefined;
  readonly defaultThinking?: string;
  readonly models: readonly Model[];
  readonly onThinkingChange?: (thinkingId: string) => void;
  readonly onValueChange?: (modelId: string) => void;
  readonly thinkingLevels?: readonly ThinkingLevel[];
  readonly thinkingValue?: string | undefined;
  readonly value?: string | undefined;
};

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  { id: "low", label: "Low", desc: "Light reasoning", Icon: Zap },
  { id: "medium", label: "Medium", desc: "Balanced reasoning", Icon: Gauge },
  { id: "high", label: "High", desc: "Deeper reasoning", Icon: Brain },
];

export function ModelSelector(props: ModelSelectorProps): ReactElement {
  const container = usePortalContainer();
  const { model, selectModel, selectThinking, thinking, thinkingDesc, thinkingLabel } =
    useModelSelectorState(props);
  const { models, thinkingLevels = THINKING_LEVELS } = props;

  return (
    <Combobox.Root
      isItemEqualToValue={(left: Model | null, right: Model | null) => left?.id === right?.id}
      itemToStringLabel={(item: Model | null) => item?.name ?? ""}
      items={models}
      onValueChange={selectModel}
      value={model}
    >
      <ModelSelectorTrigger thinkingLabel={thinkingLabel} />
      <ModelSelectorPopup
        container={container}
        model={model}
        onThinkingChange={selectThinking}
        thinking={thinking}
        thinkingDesc={thinkingDesc}
        thinkingLabel={thinkingLabel}
        thinkingLevels={thinkingLevels}
      />
    </Combobox.Root>
  );
}

const useModelSelectorState = ({
  defaultModel,
  defaultThinking = "medium",
  models,
  onThinkingChange,
  onValueChange,
  thinkingLevels = THINKING_LEVELS,
  thinkingValue,
  value,
}: ModelSelectorProps): {
  readonly model: Model | null;
  readonly selectModel: (nextModel: Model | null) => void;
  readonly selectThinking: (nextThinking: string) => void;
  readonly thinking: string;
  readonly thinkingDesc: string;
  readonly thinkingLabel: string;
} => {
  const [localModelId, setLocalModelId] = useState<string | undefined>(
    () => defaultModel?.id ?? models[0]?.id,
  );
  const [localThinking, setLocalThinking] = useState(defaultThinking);

  const modelId = value ?? localModelId;
  const model =
    models.find((candidate) => candidate.id === modelId) ?? defaultModel ?? models[0] ?? null;
  const thinking = thinkingValue ?? localThinking;
  const selectedThink = thinkingLevels.find((level) => level.id === thinking);
  const thinkingLabel = selectedThink?.label ?? thinking;
  const thinkingDesc = selectedThink?.desc ?? "";

  const selectModel = (nextModel: Model | null): void => {
    const nextModelId = nextModel?.id;
    setLocalModelId(nextModelId);
    if (nextModelId) onValueChange?.(nextModelId);
  };

  const selectThinking = (nextThinking: string): void => {
    setLocalThinking(nextThinking);
    onThinkingChange?.(nextThinking);
  };

  return { model, selectModel, selectThinking, thinking, thinkingDesc, thinkingLabel };
};

const ModelSelectorTrigger = ({
  thinkingLabel,
}: {
  readonly thinkingLabel: string;
}): ReactElement => (
  <Combobox.Trigger className="sc-icon-btn w-auto gap-1.5 px-2">
    <Combobox.Value>
      {(selectedModel: Model | null) => (
        <span className="truncate text-sm font-medium text-foreground">
          {selectedModel?.name ?? "Select model"}
        </span>
      )}
    </Combobox.Value>
    <span className="shrink-0 text-xs text-muted-foreground">/ {thinkingLabel}</span>
    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
  </Combobox.Trigger>
);

const ModelSelectorPopup = ({
  container,
  model,
  onThinkingChange,
  thinking,
  thinkingDesc,
  thinkingLabel,
  thinkingLevels,
}: {
  readonly container: HTMLElement | null;
  readonly model: Model | null;
  readonly onThinkingChange: (thinkingId: string) => void;
  readonly thinking: string;
  readonly thinkingDesc: string;
  readonly thinkingLabel: string;
  readonly thinkingLevels: readonly ThinkingLevel[];
}): ReactElement => (
  <Combobox.Portal container={container}>
    <Combobox.Positioner align="end" side="top" sideOffset={8}>
      <Combobox.Popup data-slot="combobox-content" className="w-menu max-w-full">
        <ModelSearchInput />
        <Combobox.Empty className="sc-combo-empty">No models found.</Combobox.Empty>
        <ModelOptions />
        <ThinkingSelector
          onThinkingChange={onThinkingChange}
          thinking={thinking}
          thinkingDesc={thinkingDesc}
          thinkingLevels={thinkingLevels}
        />
        <ModelStatus model={model} thinkingLabel={thinkingLabel} />
      </Combobox.Popup>
    </Combobox.Positioner>
  </Combobox.Portal>
);

const ModelSearchInput = (): ReactElement => (
  <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
    <Search className="size-4 shrink-0 text-muted-foreground" />
    <Combobox.Input
      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      placeholder="Search models..."
    />
  </div>
);

const ModelOptions = (): ReactElement => (
  <Combobox.List className="max-h-64 overflow-auto p-1">
    {(candidate: Model) => (
      <Combobox.Item
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 highlighted:bg-accent"
        key={candidate.id}
        value={candidate}
      >
        <Media>{candidate.icon}</Media>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{candidate.name}</span>
          <span className="truncate text-xs text-muted-foreground">{candidate.desc}</span>
        </span>
        <Combobox.ItemIndicator className="ml-auto shrink-0 text-primary opacity-0 selected:opacity-100">
          <Check className="size-4" />
        </Combobox.ItemIndicator>
      </Combobox.Item>
    )}
  </Combobox.List>
);

const ThinkingSelector = ({
  onThinkingChange,
  thinking,
  thinkingDesc,
  thinkingLevels,
}: {
  readonly onThinkingChange: (thinkingId: string) => void;
  readonly thinking: string;
  readonly thinkingDesc: string;
  readonly thinkingLevels: readonly ThinkingLevel[];
}): ReactElement => (
  <div className="border-t border-border p-2">
    <div className="flex items-center justify-between gap-2 px-1 pb-2">
      <span className="shrink-0 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
        Thinking
      </span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{thinkingDesc}</span>
    </div>
    <Segmented items={thinkingLevels} onValueChange={onThinkingChange} stacked value={thinking} />
  </div>
);

const ModelStatus = ({
  model,
  thinkingLabel,
}: {
  readonly model: Model | null;
  readonly thinkingLabel: string;
}): ReactElement => (
  <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
    <span className="min-w-0 truncate">
      Using <span className="font-medium text-foreground">{model?.name ?? "no model"}</span> /{" "}
      {thinkingLabel} thinking
    </span>
  </div>
);

const MODELS: readonly Model[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet",
    desc: "Balanced - everyday tasks",
    icon: <Sparkles className="size-4" />,
  },
  {
    id: "opus",
    name: "Claude Opus",
    desc: "Deepest reasoning, slower",
    icon: <Brain className="size-4" />,
  },
  {
    id: "haiku",
    name: "Claude Haiku",
    desc: "Fastest, lightweight",
    icon: <Sparkles className="size-4" />,
  },
  {
    id: "tools",
    name: "Agent (tools)",
    desc: "Calls tools and APIs",
    icon: <Wrench className="size-4" />,
  },
  {
    id: "web",
    name: "Web-grounded",
    desc: "Answers with live search",
    icon: <Globe className="size-4" />,
  },
];

export function ModelSelectorSection(): ReactElement {
  return (
    <div className="flex justify-end">
      <ModelSelector models={MODELS} defaultModel={MODELS[1]} defaultThinking="medium" />
    </div>
  );
}
