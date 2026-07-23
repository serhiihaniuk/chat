/**
 * Tabs — Base UI Tabs with PANELS (distinct from Segmented, which has none).
 *
 * Root drives value/onValueChange; the List + every Panel are siblings sharing the
 * same values. Drive both the tabs and their panels from ONE array so adding a group
 * appears in both places. Active tab is expressed with the `selected:` variant; `hover:`
 * is acceptable on the Tab trigger because it mirrors the contract snippet.
 */
import { useState, type ReactElement, type ReactNode } from "react";

import { Tabs } from "@base-ui/react/tabs";
import { Brain, Settings, Sparkles } from "lucide-react";

import { cn } from "#shared/lib/cn";

const TAB_CLASS =
  "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm text-muted-foreground cursor-pointer highlighted:bg-accent selected:bg-sidebar-accent selected:text-foreground";

type TabGroup = {
  value: string;
  label: string;
  icon: ReactElement;
  content: ReactNode;
};

const GROUPS: TabGroup[] = [
  {
    value: "general",
    label: "General",
    icon: <Settings className="size-4 shrink-0" />,
    content: (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-foreground">General</h3>
        <p className="text-sm text-muted-foreground">
          Baseline preferences that apply across every conversation in the widget.
        </p>
      </div>
    ),
  },
  {
    value: "models",
    label: "Models",
    icon: <Sparkles className="size-4 shrink-0" />,
    content: (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-foreground">Models</h3>
        <p className="text-sm text-muted-foreground">
          Choose which backend model answers and how it is allowed to reason.
        </p>
      </div>
    ),
  },
  {
    value: "reasoning",
    label: "Reasoning",
    icon: <Brain className="size-4 shrink-0" />,
    content: (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-foreground">Reasoning</h3>
        <p className="text-sm text-muted-foreground">
          Control how much intermediate thinking is surfaced before the final answer.
        </p>
      </div>
    ),
  },
];

export function TabsSection(): ReactElement {
  const [value, setValue] = useState<string>(GROUPS[0]?.value ?? "");

  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") setValue(next);
      }}
      className="flex gap-6"
    >
      <Tabs.List className="flex flex-col gap-1 w-44 shrink-0">
        {GROUPS.map((group) => (
          <Tabs.Tab key={group.value} value={group.value} className={cn(TAB_CLASS)}>
            {group.icon}
            <span className="truncate">{group.label}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {GROUPS.map((group) => (
        <Tabs.Panel key={group.value} value={group.value} className="flex-1 min-w-0">
          {group.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
