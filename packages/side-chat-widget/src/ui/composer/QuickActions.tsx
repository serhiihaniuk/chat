import {
  AlertTriangle,
  CalendarClock,
  FileText,
  ListChecks,
  Trophy,
} from "lucide-react";
import {
  Suggestion,
  Suggestions,
} from "../../shared/ui/ai-elements/suggestion.js";

export type QuickActionsProps = {
  isStreaming: boolean;
  onQuickPrompt: (prompt: string, displayContent?: string) => void;
};

export const QuickActions = ({
  isStreaming,
  onQuickPrompt,
}: QuickActionsProps) => (
  <div className="mx-auto mt-5 flex w-full max-w-3xl shrink-0 items-center px-8 max-sm:px-4">
    <Suggestions className="min-w-0 flex-1 gap-2 pr-0">
      <Suggestion
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Summarize this page", "Summary")}
      >
        <ListChecks
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Summary
      </Suggestion>
      <Suggestion
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Generate a report", "Report")}
      >
        <FileText
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Report
      </Suggestion>
      <Suggestion
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Who is our biggest client?", "Top client")}
      >
        <Trophy
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Top client
      </Suggestion>
      <Suggestion
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() =>
          onQuickPrompt(
            "Filter the table to the highest risk portfolios and tell me the highlights.",
          )
        }
      >
        <AlertTriangle
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Risk
      </Suggestion>
      <Suggestion
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() =>
          onQuickPrompt(
            "Filter the table to overdue tasks due first and tell me the highlights.",
          )
        }
      >
        <CalendarClock
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Due
      </Suggestion>
    </Suggestions>
  </div>
);

const quickActionClassName =
  "h-9 gap-2 rounded-md px-3 text-sm font-medium shadow-none max-sm:h-8 max-sm:px-2.5 max-sm:text-xs [&_svg]:size-4";
