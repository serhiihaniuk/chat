import { AgentMark } from "#shared/ui/agent-mark";
import { Button } from "#shared/ui/button";
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
  assistantTitle,
  description,
  onSelectSuggestion,
  suggestions,
  title,
}: {
  readonly assistantTitle?: string | undefined;
  readonly description: string;
  readonly onSelectSuggestion: (prompt: string) => void;
  readonly suggestions: readonly WidgetEmptyStateSuggestion[];
  readonly title: string;
}) => (
  <div className="flex h-full w-full flex-col items-center justify-center px-2 py-6">
    <div className="flex w-full max-w-[28.25rem] flex-col gap-5">
      <div className="flex flex-col gap-3">
        {assistantTitle && (
          <span className="flex min-w-0 items-center gap-2">
            <AgentMark className="size-5 shrink-0 text-primary/80" />
            <span className="truncate font-semibold text-xl text-card-foreground tracking-tight">
              {assistantTitle}
            </span>
          </span>
        )}
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
              <Button
                className="w-full justify-start gap-2.5 px-3 py-2.5 text-left text-card-foreground"
                onClick={() => onSelectSuggestion(suggestion.prompt)}
                type="button"
                variant="ghost"
              >
                <suggestion.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
                <ChevronRightIcon className="size-[0.9375rem] shrink-0 text-border" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
