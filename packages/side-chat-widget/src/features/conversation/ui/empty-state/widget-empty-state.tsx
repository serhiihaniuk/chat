import { AgentMark } from "#shared/ui/agent-mark";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";

export type WidgetEmptyStateSuggestion = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly icon: LucideIcon;
};

// Centered greeting cluster shown before the first turn. Capped to a tidy measure so
// it stays a neat block in a large/tall panel instead of stretching full width.
export const WidgetEmptyState = ({
  description,
  onSelectSuggestion,
  suggestions,
  title,
}: {
  readonly description: string;
  readonly onSelectSuggestion: (prompt: string) => void;
  readonly suggestions: readonly WidgetEmptyStateSuggestion[];
  readonly title: string;
}) => (
  <div className="flex h-full w-full flex-col items-center justify-center px-2 py-6">
    <div className="flex w-full max-w-[28.25rem] flex-col gap-5">
      <div className="flex flex-col gap-3">
        <span className="flex size-10 items-center justify-center rounded-md border border-border bg-accent">
          <AgentMark className="size-[1.375rem] text-primary" />
        </span>
        <h2 className="font-semibold text-2xl text-card-foreground leading-snug tracking-tight">
          {title}
        </h2>
        <p className="max-w-[20.625rem] text-[0.84rem] text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => onSelectSuggestion(suggestion.prompt)}
                type="button"
              >
                <suggestion.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
                <ChevronRightIcon className="size-[0.9375rem] shrink-0 text-border" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
