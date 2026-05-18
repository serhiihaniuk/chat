import {
  AlertTriangle,
  CalendarClock,
  Database,
  FileText,
  ListChecks,
  Trophy,
} from "lucide-react";
import {
  Suggestion,
  Suggestions,
} from "../../shared/ui/ai-elements/suggestion.js";

/**
 * Demo prompt surface. Quick actions paste real user messages into the chat so
 * the normal model/protocol/tool path runs instead of a hidden shortcut.
 */
export type QuickActionsProps = {
  isStreaming: boolean;
  onQuickPrompt: (prompt: string, displayContent?: string) => void;
};

export const sourceBackedBriefPrompt =
  "Build a source-backed command-center brief for the Advisory Workbench. Before answering, check the approved Workbench sources for dashboard KPIs, the current Portfolio Worklist view, top risk accounts, product allocation, and Net New Money trend. Then answer with: 1) executive readout, 2) top 3 risk portfolios with RM, due date, exposure, and 30D flow, 3) allocation or money-flow signal, and 4) next actions.";

export const QuickActions = ({
  isStreaming,
  onQuickPrompt,
}: QuickActionsProps) => (
  <div className="mx-auto mt-3 flex w-full max-w-3xl shrink-0 items-center px-8 max-sm:px-4">
    <Suggestions className="min-w-0 flex-1 gap-2 py-[2px] pr-0">
      <Suggestion
        aria-label="Summary: summarize the current Workbench page"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Summarize this page", "Summary")}
        title="Summarizes the current Workbench page using visible KPIs, table rows, and page context."
      >
        <ListChecks
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Summary
      </Suggestion>
      <Suggestion
        aria-label="Risk brief: run a source-backed command-center analysis"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt(sourceBackedBriefPrompt, "Risk brief")}
        title="Checks Workbench KPIs, current view, risk accounts, allocation, and Net New Money before answering."
      >
        <Database
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Risk brief
      </Suggestion>
      <Suggestion
        aria-label="Report: generate a report from the current page"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Generate a report", "Report")}
        title="Starts the report flow and asks which report sections to generate from the current page context."
      >
        <FileText
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Report
      </Suggestion>
      <Suggestion
        aria-label="Top client: find the biggest client by AUM"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() => onQuickPrompt("Who is our biggest client?", "Top client")}
        title="Finds the biggest client in the current page context, normally by total AUM."
      >
        <Trophy
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Top client
      </Suggestion>
      <Suggestion
        aria-label="Risk: filter the table to highest-risk portfolios"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() =>
          onQuickPrompt(
            "Filter the table to the highest risk portfolios and tell me the highlights.",
          )
        }
        title="Filters the portfolio table to the highest-risk rows and asks for the key highlights."
      >
        <AlertTriangle
          aria-hidden="true"
          style={{ color: "var(--sidechat-accent)" }}
        />
        Risk
      </Suggestion>
      <Suggestion
        aria-label="Due: filter the table to overdue tasks"
        className={quickActionClassName}
        disabled={isStreaming}
        onClick={() =>
          onQuickPrompt(
            "Filter the table to overdue tasks due first and tell me the highlights.",
          )
        }
        title="Filters the portfolio table to overdue or soonest-due tasks and asks for the key highlights."
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
  "h-8 gap-2 rounded-md px-3 text-sm font-medium shadow-none max-sm:h-7 max-sm:px-2.5 max-sm:text-xs [&_svg]:size-4";
