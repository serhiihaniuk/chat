/**
 * §8.4 — Row: the shared layout for selectable lines.
 *
 * Row is a class-name pattern, not a separate Base UI component. A line has
 * `[leading media?] [title + optional subtitle] [trailing indicator?]` and is
 * used in two forms:
 *
 * - A Base UI `Menu.Item`, `Select.Item`, or `Combobox.Item`. Base UI supplies
 *   `highlighted:` for pointer/keyboard focus and `selected:` for the check.
 * - A standalone `<button>` such as a conversation row. It uses
 *   `aria-current="true"` for the active conversation and shows a trailing dot.
 *
 * Keep `min-w-0` on the title column and `truncate` on the text, or a long title
 * widens the panel. Keep the trailing indicator in the DOM at `opacity-0` and
 * reveal it with state, or selection will move the rest of the row.
 *
 * Consumers add `rowBaseClass` to their item or button, then append its state
 * variant.
 */
import { useState, type ReactElement } from "react";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Brain, Sparkles, Wrench } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { usePortalContainer } from "#shared/ui/widget-root";

/**
 * The shared Row layout — leading media, a min-w-0 title column, a trailing
 * indicator. Append the form-specific state variant (`highlighted:bg-(--row-bg-hover)`
 * for a Base UI item, `hover:bg-(--row-bg-hover) aria-[current=true]:bg-(--row-bg-active)`
 * for a standalone button).
 */
export const rowBaseClass =
  "flex w-full cursor-pointer select-none items-center gap-(--row-gap) rounded-(--row-radius) px-(--row-px) py-(--row-py) text-left";

type Model = { id: string; name: string; desc: string; icon: ReactElement };

const MODELS: Model[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet",
    desc: "Balanced everyday model",
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
    desc: "Fastest, most compact",
    icon: <Wrench className="size-4" />,
  },
];

type Conversation = { id: string; title: string; when: string };

const CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "Refactor the portal container contract", when: "2m ago" },
  {
    id: "c2",
    title: "Why does a long conversation title widen the rail panel?",
    when: "1h ago",
  },
  { id: "c3", title: "Token re-skinning notes", when: "Yesterday" },
];

export function RowSection(): ReactElement {
  const container = usePortalContainer();
  const [model, setModel] = useState<string>("opus");
  const [activeId, setActiveId] = useState<string>("c2");

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* A) Row as a Base UI Select.Item — highlighted: + selected: ----------- */}
      <div className="flex w-menu flex-col gap-2">
        <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          As a Base UI item (highlighted / selected)
        </div>

        <Select.Root value={model} onValueChange={(value) => setModel(value ?? model)}>
          <Select.Trigger className="flex h-header w-full items-center justify-between gap-2 rounded-md border border-input px-2.5 text-sm text-foreground">
            <Select.Value className="truncate" />
            <Select.Icon
              render={<ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
            />
          </Select.Trigger>

          <Select.Portal container={container}>
            <Select.Positioner side="bottom" align="start" sideOffset={6}>
              <Select.Popup data-slot="select-content" className="w-menu min-w-0 p-1">
                <Select.List>
                  {MODELS.map((m) => (
                    <Select.Item
                      key={m.id}
                      value={m.id}
                      className={cn(rowBaseClass, "highlighted:bg-(--row-bg-hover)")}
                    >
                      <span className="sc-media">{m.icon}</span>
                      <span className="flex min-w-0 flex-col">
                        <Select.ItemText className="truncate text-sm font-medium text-foreground">
                          {m.name}
                        </Select.ItemText>
                        <span className="truncate text-xs text-muted-foreground">{m.desc}</span>
                      </span>
                      <Select.ItemIndicator className="ml-auto flex shrink-0 text-primary opacity-0 selected:opacity-100">
                        <Check className="size-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* B) Row as a standalone conversation <button> — aria-current ---------- */}
      <div className="flex w-menu flex-col gap-2">
        <div className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          As a conversation button (aria-current)
        </div>

        <div className="flex flex-col gap-0.5">
          {CONVERSATIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === activeId ? true : undefined}
              onClick={() => setActiveId(c.id)}
              className={cn(
                rowBaseClass,
                "hover:bg-(--row-bg-hover) aria-[current=true]:bg-(--row-bg-active)",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
                <span className="truncate text-xs text-muted-foreground">{c.when}</span>
              </span>
              <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary opacity-0 aria-[current=true]:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
