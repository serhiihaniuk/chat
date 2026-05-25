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
import { Button } from "#shared/ui/button";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import type { CSSProperties } from "react";

import type {
  SideChatWidgetAssistantProfile,
  SideChatWidgetPanelSize,
} from "./widget.types.js";

export const toPanelStyle = (
  defaultPanelSize: SideChatWidgetPanelSize | undefined,
): CSSProperties => ({
  height: defaultPanelSize?.height
    ? Math.min(defaultPanelSize.height, 760)
    : undefined,
  width: defaultPanelSize?.width
    ? Math.min(defaultPanelSize.width, 440)
    : undefined,
});

export const ClosedWidgetLauncher = ({
  label,
  onOpen,
}: {
  readonly label: string;
  readonly onOpen: () => void;
}) => (
  <Button
    className="fixed right-4 bottom-4 z-50 shadow-lg"
    onClick={onOpen}
    type="button"
  >
    {label}
  </Button>
);

export const WidgetHeader = ({
  onClose,
  onProfileSelect,
  profiles,
  selectedProfileId,
  selectedProfileLabel,
  title,
}: {
  readonly onClose: () => void;
  readonly onProfileSelect: (profileId: string) => void;
  readonly profiles: readonly SideChatWidgetAssistantProfile[];
  readonly selectedProfileId: string | undefined;
  readonly selectedProfileLabel: string | undefined;
  readonly title: string;
}) => (
  <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
    <div className="min-w-0">
      <h2 className="truncate font-medium text-sm">{title}</h2>
      {selectedProfileLabel && (
        <p className="truncate text-muted-foreground text-xs">
          {selectedProfileLabel}
        </p>
      )}
    </div>
    <div className="flex items-center gap-1">
      {profiles.length > 0 && (
        <ProfileSelector
          onSelect={onProfileSelect}
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          selectedProfileLabel={selectedProfileLabel}
        />
      )}
      <Button
        aria-label="Close"
        onClick={onClose}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  </header>
);

const ProfileSelector = ({
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
      render={
        <Button
          aria-label="Select model"
          size="sm"
          type="button"
          variant="ghost"
        />
      }
    >
      <span className="max-w-28 truncate">
        {selectedProfileLabel ?? "Model"}
      </span>
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
              {profile.id === selectedProfileId && (
                <CheckIcon className="size-4" />
              )}
            </ModelSelectorItem>
          ))}
        </ModelSelectorGroup>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector>
);
