import { FileText, ListChecks, RefreshCcw, Trophy } from "lucide-react";
import {
  Suggestion,
  Suggestions,
} from "../components/ai-elements/suggestion.js";

export type QuickActionsProps = {
  isStreaming: boolean;
  onQuickPrompt: (prompt: string, displayContent?: string) => void;
  onRetry: () => void;
};

export const QuickActions = ({
  isStreaming,
  onQuickPrompt,
  onRetry,
}: QuickActionsProps) => (
  <div className="mx-auto mt-6 flex w-full max-w-3xl shrink-0 items-center gap-4 px-8 max-sm:px-4 max-sm:gap-2">
    <Suggestions className="min-w-0 flex-1">
      <Suggestion
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Summarize this page")}
      >
        <ListChecks
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Summarize this page
      </Suggestion>
      <Suggestion
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Generate a report", "Generate report")}
      >
        <FileText
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Generate report
      </Suggestion>
      <Suggestion
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Who is our biggest client?")}
      >
        <Trophy
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Biggest client
      </Suggestion>
    </Suggestions>
    <button
      type="button"
      aria-label="Retry last message"
      className="ml-auto inline-flex size-12 items-center justify-center rounded-lg border bg-white text-slate-500 shadow-sm transition hover:text-slate-900 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-sm:ml-0 max-sm:size-10 [&_svg]:size-5"
      disabled={isStreaming}
      onClick={onRetry}
      style={{
        borderColor: "var(--sidechat-border)",
        outlineColor: "var(--sidechat-accent)",
      }}
    >
      <RefreshCcw aria-hidden="true" />
    </button>
  </div>
);
