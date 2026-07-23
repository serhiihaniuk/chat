import type { ReactElement, ReactNode } from "react";

import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import { Check, ChevronDown, Menu } from "lucide-react";

import { cn } from "#shared/lib/cn";
import type { SettingsGroup } from "#shared/ui/settings-groups";
import { usePortalContainer } from "#shared/ui/widget-root";

const SETTINGS_NAV_ROW_CLASS =
  "flex w-full cursor-pointer select-none items-center gap-(--row-gap) rounded-(--settings-item-radius) border-0 bg-transparent px-(--settings-item-px) py-(--settings-item-py) text-left highlighted:bg-(--settings-item-hover-bg) selected:bg-(--settings-item-active-bg)";

export const WideSettingsNav = ({
  activeGroupId,
  groups,
  railHeader,
}: {
  readonly activeGroupId: string;
  readonly groups: readonly SettingsGroup[];
  readonly railHeader: ReactNode;
}): ReactElement => (
  <div className="sc-settings-wide w-(--settings-nav-w) shrink-0 flex-col border-r border-(--settings-nav-border) bg-(--settings-nav-bg)">
    {railHeader}
    <Tabs.List className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 py-2.5">
      {groups.map((group) => {
        const active = group.id === activeGroupId;
        return (
          <Tabs.Tab
            key={group.id}
            value={group.id}
            aria-label={group.label}
            data-active={active ? "true" : undefined}
            className={SETTINGS_NAV_ROW_CLASS}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-(--settings-item-title-fg)">
                {group.label}
              </span>
              <span className="truncate text-xs text-(--settings-item-desc-fg)">
                {group.description}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "ml-auto size-1.5 shrink-0 rounded-full bg-(--settings-item-indicator) opacity-0",
                active && "opacity-100",
              )}
            />
          </Tabs.Tab>
        );
      })}
    </Tabs.List>
  </div>
);

export const NarrowSettingsSelect = ({
  active,
  groups,
  onGroupChange,
}: {
  readonly active: SettingsGroup;
  readonly groups: readonly SettingsGroup[];
  readonly onGroupChange: (groupId: string) => void;
}): ReactElement => {
  const container = usePortalContainer();
  const selectGroup = (next: SettingsGroup | null): void => {
    if (next) onGroupChange(next.id);
  };

  return (
    <Select.Root
      items={groups.map((group) => ({ label: group.label, value: group }))}
      value={active}
      onValueChange={selectGroup}
      itemToStringLabel={(group: SettingsGroup) => group.label}
      isItemEqualToValue={(left: SettingsGroup, right: SettingsGroup) => left?.id === right?.id}
    >
      <Select.Trigger className="sc-settings-select-trigger flex-none">
        <Menu className="shrink-0 text-muted-foreground" size={15} strokeWidth={1.8} />
        <Select.Value className="flex-1 text-left text-sm font-medium text-foreground" />
        <Select.Icon className="inline-flex text-muted-foreground">
          <ChevronDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal container={container}>
        <Select.Positioner sideOffset={5}>
          <Select.Popup data-slot="select-content">
            <Select.List>
              {groups.map((group) => (
                <Select.Item key={group.id} value={group} className="sc-settings-menu-row">
                  <Select.ItemText className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {group.label}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {group.description}
                      </span>
                    </span>
                  </Select.ItemText>
                  <Select.ItemIndicator className="inline-flex shrink-0 text-primary">
                    <Check className="size-3.5" strokeWidth={2.4} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
};
